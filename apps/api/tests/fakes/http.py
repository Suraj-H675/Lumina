from __future__ import annotations

from typing import Any

import anyio
import httpx
from fastapi import FastAPI


def request_asgi(
    app: FastAPI,
    method: str,
    path: str,
    **kwargs: Any,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return anyio.run(send)


def get_asgi(app: FastAPI, path: str) -> httpx.Response:
    return request_asgi(app, "GET", path)
