import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Code, Database, Lock, Zap } from 'lucide-react';

export default function BackendArchitecture() {
  return (
    <div className="space-y-6 p-6 bg-slate-50 rounded-xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Code className="w-6 h-6" />
          Backend Scaffold - FastAPI + SQLAlchemy
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Directory Structure */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">📁 Folder Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-900 text-emerald-400 p-4 rounded overflow-auto max-h-96">
{`crm_platform/
├── app/
│   ├── __init__.py
│   ├── main.py (FastAPI app)
│   ├── config.py (settings)
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── auth.py (TenantMiddleware)
│   │   └── logging.py
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py (BaseModel)
│   │   ├── account.py (Account ORM)
│   │   ├── contact.py (Contact ORM)
│   │   ├── lead.py (Lead ORM)
│   │   ├── deal.py (Deal ORM)
│   │   ├── activity.py (Activity ORM)
│   │   ├── audit_log.py (Audit ORM)
│   │   └── role.py (Role/Permission ORM)
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── account.py (Pydantic schemas)
│   │   ├── contact.py
│   │   └── common.py (SharedSchemas)
│   │
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── jwt.py (JWT tokens)
│   │   ├── rbac.py (Role checks)
│   │   ├── tenant.py (Tenant isolation)
│   │   └── permissions.py (Perm matrix)
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── accounts.py (CRUD routes)
│   │   │   ├── contacts.py
│   │   │   ├── leads.py
│   │   │   ├── deals.py
│   │   │   └── auth.py (login/register)
│   │   └── v2/ (future)
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── account_service.py
│   │   ├── lead_score_service.py
│   │   ├── dedupe_service.py
│   │   └── audit_service.py
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── session.py (SessionLocal)
│   │   └── init_db.py (migrations)
│   │
│   └── utils/
│       ├── __init__.py
│       ├── decorators.py (@require_role)
│       └── validators.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py (fixtures)
│   ├── test_accounts.py
│   └── test_auth.py
│
├── migrations/ (Alembic)
├── docker-compose.yml
├── requirements.txt
└── .env.example`}
            </pre>
          </CardContent>
        </Card>

        {/* Models Overview */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">🗄️ Base Model (SQLAlchemy)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-900 text-emerald-400 p-4 rounded overflow-auto max-h-96">
{`# models/base.py
from sqlalchemy import Column, DateTime, UUID, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import declared_attr
from datetime import datetime
import uuid

Base = declarative_base()

class BaseModel(Base):
    __abstract__ = True
    
    id = Column(UUID(as_uuid=True), 
                primary_key=True, 
                default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), 
                       nullable=False,
                       index=True)
    created_at = Column(DateTime, 
                        default=datetime.utcnow)
    updated_at = Column(DateTime, 
                        default=datetime.utcnow,
                        onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, 
                        nullable=True)  # soft delete
    
    # Soft delete filter
    @classmethod
    def active(cls):
        return cls.deleted_at == None`}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Auth & RBAC Architecture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-emerald-400 p-4 rounded overflow-auto">
{`# auth/rbac.py
from enum import Enum
from typing import List

class Role(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    SALES_REP = "sales_rep"
    VIEWER = "viewer"

ROLE_PERMISSIONS = {
    Role.ADMIN: [
        "account:*",
        "contact:*",
        "lead:*",
        "deal:*",
        "user:*",
        "audit:view",
        "role:manage"
    ],
    Role.MANAGER: [
        "account:read",
        "contact:*",
        "lead:*",
        "deal:*",
        "report:view"
    ],
    Role.SALES_REP: [
        "contact:read",
        "lead:read,create,update",
        "deal:read,create,update"
    ],
    Role.VIEWER: [
        "account:read",
        "contact:read",
        "report:view"
    ]
}

# auth/tenant.py
from fastapi import Request, HTTPException

async def get_current_tenant(request: Request) -> UUID:
    """
    Extract tenant_id from JWT or header
    All queries MUST filter: WHERE tenant_id = current_tenant
    """
    token = request.headers.get("Authorization")
    if not token:
        raise HTTPException(status_code=401)
    
    # Decode JWT → extract tenant_id
    payload = jwt.decode(token, settings.SECRET_KEY)
    tenant_id = payload.get("tenant_id")
    
    if not tenant_id:
        raise HTTPException(status_code=403)
    
    return UUID(tenant_id)`}
            </pre>
          </CardContent>
        </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-5 h-5" />
            API Routes Example (FastAPI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-emerald-400 p-4 rounded overflow-auto">
{`# api/v1/accounts.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ...models import Account
from ...schemas import AccountCreate, AccountRead
from ...auth.rbac import require_permission
from ...db import get_db
from ...auth.tenant import get_current_tenant
import uuid

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.get("", response_model=List[AccountRead])
async def list_accounts(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_tenant: uuid.UUID = Depends(get_current_tenant),
    _: None = Depends(require_permission("account:read"))
):
    """
    List all accounts for current tenant
    CRITICAL: WHERE tenant_id = current_tenant
    """
    accounts = db.query(Account).filter(
        Account.tenant_id == current_tenant,
        Account.deleted_at == None
    ).offset(skip).limit(limit).all()
    
    return accounts

@router.post("", response_model=AccountRead)
async def create_account(
    account: AccountCreate,
    db: Session = Depends(get_db),
    current_tenant: uuid.UUID = Depends(get_current_tenant),
    _: None = Depends(require_permission("account:create"))
):
    """
    Create new account
    Audit log זה מתחיל אוטומטית
    """
    new_account = Account(
        **account.dict(),
        tenant_id=current_tenant
    )
    db.add(new_account)
    db.commit()
    
    # Audit log שנוצר אוטומטית (via trigger)
    return new_account

@router.get("/{account_id}", response_model=AccountRead)
async def get_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_tenant: uuid.UUID = Depends(get_current_tenant),
    _: None = Depends(require_permission("account:read"))
):
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == current_tenant
    ).first()
    
    if not account:
        raise HTTPException(status_code=404)
    
    return account`}
            </pre>
          </CardContent>
        </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">📝 models/account.py</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-slate-900 text-emerald-400 p-4 rounded overflow-auto">
{`from sqlalchemy import Column, String, Integer, Enum, ForeignKey, JSON
from .base import BaseModel
import enum

class AccountStatus(str, enum.Enum):
    PROSPECT = "prospect"
    CUSTOMER = "customer"
    PARTNER = "partner"
    CHURNED = "churned"

class Account(BaseModel):
    __tablename__ = "accounts"
    
    # core fields
    name = Column(String, nullable=False, index=True)
    industry = Column(String)
    website = Column(String)
    phone = Column(String)
    address = Column(String)
    city = Column(String)
    country = Column(String)
    
    # business
    annual_revenue = Column(Integer)
    employee_count = Column(Integer)
    description = Column(String)
    
    # status
    status = Column(Enum(AccountStatus), 
                   default=AccountStatus.PROSPECT)
    owner_id = Column(String)  # FK to User
    
    # extensibility
    custom_fields = Column(JSON, default={})
    tags = Column(JSON, default=[])  # ["vip", "tech_stack"]
    
    def __repr__(self):
        return f"<Account {self.name}>"
`}
            </pre>
          </CardContent>
        </Card>

      <Card className="border-0 shadow-sm bg-amber-50">
        <CardContent className="p-6 space-y-3">
          <p className="font-semibold text-slate-900">🚀 How to Run Locally:</p>
          <pre className="text-xs bg-slate-900 text-emerald-400 p-3 rounded">
{`# 1. Setup virtual env
python -m venv venv
source venv/bin/activate

# 2. Install deps
pip install -r requirements.txt

# 3. Database
docker-compose up -d postgres redis
alembic upgrade head

# 4. Run server
uvicorn app.main:app --reload --port 8000

# 5. API docs
http://localhost:8000/docs (Swagger UI)
http://localhost:8000/redoc (ReDoc)
`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}