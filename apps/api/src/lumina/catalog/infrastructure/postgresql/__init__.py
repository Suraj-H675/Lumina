"""PostgreSQL catalogue persistence adapters."""

from .ingestion import PostgreSqlCatalogIngestionStore
from .read import PostgreSqlCatalogReadRepository
from .search import PostgreSqlCatalogSearchRepository

__all__ = [
    "PostgreSqlCatalogIngestionStore",
    "PostgreSqlCatalogReadRepository",
    "PostgreSqlCatalogSearchRepository",
]
