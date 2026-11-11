"""Team layer v0.3.0 preparation (TEAM_LAYER_PROTOCOL.md, DRAFT).

Implements the protocol's evidence rule (section 1), team effects (section 2) and template-mass
mapping (section 3) as pure functions with synthetic tests. Nothing here downloads data, fits on
real seasons, reads 2024 outcomes, selects a base engine or changes the sampler. Wiring into the
engine waits for the section-0 base package and the engine ownership handoff.
"""
STATUS = 'PREPARATION_ONLY'
