"""
Database engine, session factory, and base metadata.

Uses SQLAlchemy 2.0 with a sync engine (works with sqlite + postgres).
All models inherit from `Base` defined here.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Common declarative base for every ORM model."""
    pass


engine = create_engine(
    settings.database_url,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: yields a short-lived DB session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional context for service-layer code."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def create_all() -> None:
    """Create all tables. Called at startup for the demo DB."""
    # Import models so their classes register with Base.metadata
    from app.models import base  # noqa: F401
    from app.models import tenant  # noqa: F401
    from app.models import ontology  # noqa: F401
    from app.models import events  # noqa: F401
    from app.models import state  # noqa: F401
    from app.models import workflow  # noqa: F401
    from app.models import audit  # noqa: F401
    from app.models import permissions  # noqa: F401
    from app.models import alerts  # noqa: F401
    Base.metadata.create_all(bind=engine)
