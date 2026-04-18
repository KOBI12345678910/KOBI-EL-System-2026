"""
Domain services: schema registry, data quality, identity resolution,
workflow runtime, audit log, Claude AI adapter, pipeline orchestrator.

Each service is a domain concern that sits on top of the db/ repository
layer and the infra/ abstractions (message bus, cache, tenant isolation).
"""
