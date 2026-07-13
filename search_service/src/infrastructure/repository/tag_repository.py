from src.app.container import container

client = container.postgres.client

def upsert_tag(tag: str):
    pass