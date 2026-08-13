"""Catalogue ingestion application service and persistence capability."""

from .ingest import CatalogIngestionService, CatalogIngestionStore

__all__ = ["CatalogIngestionService", "CatalogIngestionStore"]
