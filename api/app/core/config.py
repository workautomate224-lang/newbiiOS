from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "FutureOS API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # OpenRouter
    openrouter_api_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Neo4j
    neo4j_uri: str = ""
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Optional APIs
    newsdata_api_key: str = ""
    sentry_dsn: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
