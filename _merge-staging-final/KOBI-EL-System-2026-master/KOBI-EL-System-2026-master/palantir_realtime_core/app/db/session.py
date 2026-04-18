"""
Database engine + async session factory.

Uses async SQLAlchemy 2.0 with asyncpg. Falls back to a no-op when
DATABASE_URL is not set, so the in-memory demo can still run on Replit
without requiring a real Postgres.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

try:
    from sqlalchemy.ext.asyncio import (
        AsyncEngine,
        AsyncSession,
        async_sessionmaker,
        create_async_engine,
    )
    _SQLALCHEMY_AVAILABLE = True
except ImportError:  # noqa
    _SQLALCHEMY_AVAILABLE = False
    AsyncEngine = None  # type: ignore
    AsyncSession = None  # type: ignore
    async_sessionmaker = None  # type: ignore
    create_async_engine = None  # type: ignore


DATABASE_URL = os.environ.get("DATABASE_URL")

_engine: Optional["AsyncEngine"] = None
_session_factory: Optional["async_sessionmaker"] = None


def get_engine() -> Optional["AsyncEngine"]:
    global _engine
    if not _SQLALCHEMY_AVAILABLE or not DATABASE_URL:
        return None
    if _engine is None:
        _engine = create_async_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
    return _engine


def get_session_factory() -> Optional["async_sessionmaker"]:
    global _session_factory
    if not _SQLALCHEMY_AVAILABLE or not DATABASE_URL:
        return None
    if _session_factory is None:
        engine = get_engine()
        if engine is None:
            return None
        _session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return _session_factory


@asynccontextmanager
async def session_scope() -> AsyncGenerator[Optional["AsyncSession"], None]:
    factory = get_session_factory()
    if factory is None:
        yield None
        return
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def is_postgres_enabled() -> bool:
    return _SQLALCHEMY_AVAILABLE and bool(DATABASE_URL)
