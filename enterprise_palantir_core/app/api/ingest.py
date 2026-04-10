from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.ingest import IngestRecordIn
from app.services.ingestion_service import IngestionService
from app.websocket_hub import websocket_hub

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("/record")
async def ingest_record(record: IngestRecordIn, db: Session = Depends(get_db)):
    service = IngestionService(db)
    result = service.ingest_record(record)

    await websocket_hub.broadcast(
        record.tenant_id,
        {
            "type": "ingestion_result",
            "tenant_id": record.tenant_id,
            "payload": result,
        },
    )

    return result
