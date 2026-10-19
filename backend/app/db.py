import logging
from pathlib import Path

from sqlalchemy import inspect, literal, text
from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

log = logging.getLogger("qadam.db")
settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")
if _is_sqlite:
    db_file = settings.database_url.replace("sqlite:///", "", 1)
    if db_file and db_file != ":memory:":
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)


def _add_missing_columns() -> None:
    """Tiny forward-only migration: add columns that newer models have and an existing DB lacks.

    New columns are added as nullable (with the model's scalar default, if any). Good enough for the pilot;
    switch to Alembic once the schema needs renames or type changes.
    """
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            missing = [c for c in table.columns if c.name not in existing]
            for col in missing:
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col.type.compile(dialect=engine.dialect)}'
                if col.default is not None and col.default.is_scalar:
                    value = literal(col.default.arg).compile(dialect=engine.dialect, compile_kwargs={"literal_binds": True})
                    ddl += f" DEFAULT {value}"
                conn.execute(text(ddl))
                log.info("Migrated: added %s.%s", table.name, col.name)
            if missing:
                for index in table.indexes:
                    index.create(conn, checkfirst=True)


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def get_session():
    with Session(engine) as session:
        yield session
