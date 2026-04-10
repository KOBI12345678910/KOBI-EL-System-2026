"""
Query DSL — a simple expression language for filtering the ontology.

Supports Palantir-inspired query expressions over entity properties.
Syntax:

  status = "at_risk"
  risk_score > 0.5
  amount_ils >= 100000
  country IN ["IL", "US"]
  name CONTAINS "aluminum"
  status = "at_risk" AND risk_score > 0.5
  (status = "at_risk" OR status = "blocked") AND delay_days > 3

Operators: = != > >= < <= IN NOT_IN CONTAINS STARTS_WITH ENDS_WITH
Boolean: AND OR NOT
Grouping: ( )

Returns a list of matching entity ids from the ontology.

Zero dependencies — a hand-written recursive descent parser.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.ontology import OntologyObject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ════════════════════════════════════════════════════════════════
# AST
# ════════════════════════════════════════════════════════════════

class Op(str, Enum):
    EQ = "="
    NEQ = "!="
    GT = ">"
    GTE = ">="
    LT = "<"
    LTE = "<="
    IN = "IN"
    NOT_IN = "NOT_IN"
    CONTAINS = "CONTAINS"
    STARTS_WITH = "STARTS_WITH"
    ENDS_WITH = "ENDS_WITH"


@dataclass
class Comparison:
    field: str
    op: Op
    value: Any

    def evaluate(self, row: Dict[str, Any]) -> bool:
        lhs = row.get(self.field)
        try:
            if self.op == Op.EQ:
                return lhs == self.value
            if self.op == Op.NEQ:
                return lhs != self.value
            if lhs is None:
                return False
            if self.op == Op.GT:
                return float(lhs) > float(self.value)
            if self.op == Op.GTE:
                return float(lhs) >= float(self.value)
            if self.op == Op.LT:
                return float(lhs) < float(self.value)
            if self.op == Op.LTE:
                return float(lhs) <= float(self.value)
            if self.op == Op.IN:
                return lhs in self.value
            if self.op == Op.NOT_IN:
                return lhs not in self.value
            if self.op == Op.CONTAINS:
                return str(self.value).lower() in str(lhs).lower()
            if self.op == Op.STARTS_WITH:
                return str(lhs).lower().startswith(str(self.value).lower())
            if self.op == Op.ENDS_WITH:
                return str(lhs).lower().endswith(str(self.value).lower())
        except Exception:
            return False
        return False


@dataclass
class BoolExpr:
    op: str  # AND, OR, NOT
    operands: List[Any] = field(default_factory=list)  # mix of Comparison and BoolExpr

    def evaluate(self, row: Dict[str, Any]) -> bool:
        if self.op == "AND":
            return all(_eval(o, row) for o in self.operands)
        if self.op == "OR":
            return any(_eval(o, row) for o in self.operands)
        if self.op == "NOT":
            return not _eval(self.operands[0], row) if self.operands else False
        return False


def _eval(node: Any, row: Dict[str, Any]) -> bool:
    if isinstance(node, Comparison):
        return node.evaluate(row)
    if isinstance(node, BoolExpr):
        return node.evaluate(row)
    return False


# ════════════════════════════════════════════════════════════════
# PARSER
# ════════════════════════════════════════════════════════════════

class QueryParseError(Exception):
    pass


class QueryParser:
    TOKEN_RE = re.compile(
        r'\s*(?:'
        r'(?P<STRING>"[^"]*")'
        r'|(?P<LBRACKET>\[)'
        r'|(?P<RBRACKET>\])'
        r'|(?P<LPAREN>\()'
        r'|(?P<RPAREN>\))'
        r'|(?P<COMMA>,)'
        r'|(?P<OP>>=|<=|!=|=|>|<)'
        r'|(?P<WORD>[A-Za-z_][A-Za-z0-9_\.]*)'
        r'|(?P<NUMBER>-?\d+(?:\.\d+)?)'
        r')'
    )

    def __init__(self, text: str) -> None:
        self.tokens = self._tokenize(text)
        self.pos = 0

    def _tokenize(self, text: str) -> List[Tuple[str, str]]:
        tokens: List[Tuple[str, str]] = []
        pos = 0
        while pos < len(text):
            match = self.TOKEN_RE.match(text, pos)
            if match is None:
                if text[pos].isspace():
                    pos += 1
                    continue
                raise QueryParseError(f"unexpected character at {pos}: {text[pos]}")
            kind = match.lastgroup or ""
            value = match.group()
            if kind == "STRING":
                value = value[1:-1]
            tokens.append((kind, value.strip()))
            pos = match.end()
        return tokens

    def _peek(self) -> Optional[Tuple[str, str]]:
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def _consume(self) -> Tuple[str, str]:
        if self.pos >= len(self.tokens):
            raise QueryParseError("unexpected end of query")
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def parse(self) -> Any:
        return self._parse_or()

    def _parse_or(self) -> Any:
        left = self._parse_and()
        while self._peek() and self._peek()[1].upper() == "OR":
            self._consume()
            right = self._parse_and()
            left = BoolExpr(op="OR", operands=[left, right])
        return left

    def _parse_and(self) -> Any:
        left = self._parse_not()
        while self._peek() and self._peek()[1].upper() == "AND":
            self._consume()
            right = self._parse_not()
            left = BoolExpr(op="AND", operands=[left, right])
        return left

    def _parse_not(self) -> Any:
        if self._peek() and self._peek()[1].upper() == "NOT":
            self._consume()
            operand = self._parse_primary()
            return BoolExpr(op="NOT", operands=[operand])
        return self._parse_primary()

    def _parse_primary(self) -> Any:
        peek = self._peek()
        if peek is None:
            raise QueryParseError("expected expression")
        if peek[0] == "LPAREN":
            self._consume()
            expr = self._parse_or()
            if self._peek() and self._peek()[0] == "RPAREN":
                self._consume()
            return expr
        return self._parse_comparison()

    def _parse_comparison(self) -> Comparison:
        # field_name OP value
        field_tok = self._consume()
        if field_tok[0] != "WORD":
            raise QueryParseError(f"expected field name, got {field_tok}")
        field_name = field_tok[1]

        op_tok = self._consume()
        op: Op
        if op_tok[0] == "OP":
            op = Op(op_tok[1])
        elif op_tok[0] == "WORD":
            word = op_tok[1].upper()
            if word == "IN":
                op = Op.IN
            elif word == "NOT_IN":
                op = Op.NOT_IN
            elif word == "CONTAINS":
                op = Op.CONTAINS
            elif word == "STARTS_WITH":
                op = Op.STARTS_WITH
            elif word == "ENDS_WITH":
                op = Op.ENDS_WITH
            else:
                raise QueryParseError(f"unknown operator: {word}")
        else:
            raise QueryParseError(f"expected operator, got {op_tok}")

        if op in (Op.IN, Op.NOT_IN):
            value = self._parse_list()
        else:
            value = self._parse_value()

        return Comparison(field=field_name, op=op, value=value)

    def _parse_list(self) -> List[Any]:
        if self._consume()[0] != "LBRACKET":
            raise QueryParseError("expected [ for list")
        values: List[Any] = []
        while True:
            peek = self._peek()
            if peek is None:
                raise QueryParseError("unexpected end of list")
            if peek[0] == "RBRACKET":
                self._consume()
                break
            values.append(self._parse_value())
            peek = self._peek()
            if peek and peek[0] == "COMMA":
                self._consume()
        return values

    def _parse_value(self) -> Any:
        tok = self._consume()
        if tok[0] == "STRING":
            return tok[1]
        if tok[0] == "NUMBER":
            return float(tok[1]) if "." in tok[1] else int(tok[1])
        if tok[0] == "WORD":
            word = tok[1]
            if word.lower() == "true":
                return True
            if word.lower() == "false":
                return False
            if word.lower() == "null":
                return None
            return word
        raise QueryParseError(f"expected value, got {tok}")


# ════════════════════════════════════════════════════════════════
# EXECUTOR
# ════════════════════════════════════════════════════════════════

@dataclass
class QueryResult:
    query: str
    matched_count: int
    elapsed_ms: int
    ids: List[str]
    rows: List[Dict[str, Any]]
    error: Optional[str] = None


class QueryDSL:
    def __init__(self, db: Session) -> None:
        self.db = db

    def execute(
        self,
        query: str,
        *,
        tenant_id: str,
        entity_type: Optional[str] = None,
        limit: int = 100,
        include_rows: bool = False,
    ) -> QueryResult:
        import time
        start = time.time()
        try:
            ast = QueryParser(query).parse()
        except QueryParseError as exc:
            return QueryResult(
                query=query,
                matched_count=0,
                elapsed_ms=int((time.time() - start) * 1000),
                ids=[],
                rows=[],
                error=str(exc),
            )

        q = (
            self.db.query(OntologyObject)
            .filter(OntologyObject.tenant_id == tenant_id)
        )
        if entity_type:
            q = q.filter(OntologyObject.object_type == entity_type)
        candidates = q.all()

        matched_ids: List[str] = []
        matched_rows: List[Dict[str, Any]] = []
        for obj in candidates:
            try:
                props = json.loads(obj.properties_json or "{}")
            except Exception:
                props = {}
            row = {
                "id": obj.id,
                "name": obj.name,
                "object_type": obj.object_type,
                "status": obj.status,
                "canonical_external_key": obj.canonical_external_key,
                **props,
            }
            if _eval(ast, row):
                matched_ids.append(obj.id)
                if include_rows:
                    matched_rows.append(row)
                if len(matched_ids) >= limit:
                    break

        return QueryResult(
            query=query,
            matched_count=len(matched_ids),
            elapsed_ms=int((time.time() - start) * 1000),
            ids=matched_ids,
            rows=matched_rows,
        )
