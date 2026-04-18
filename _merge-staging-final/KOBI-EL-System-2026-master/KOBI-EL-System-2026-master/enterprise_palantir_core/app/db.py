from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Backwards-compat alias — API routers import `get_session`.
get_session = get_db


def create_all() -> None:
    """Create all tables. Called on FastAPI startup."""
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
