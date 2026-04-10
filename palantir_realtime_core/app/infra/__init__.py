"""
Infrastructure abstractions: message bus (Kafka-compatible), cache (Redis),
CDC, and tenant isolation. Every module uses protocol-based interfaces so
production implementations (aiokafka, redis, debezium) are drop-in
replacements for the in-process fallbacks.
"""
