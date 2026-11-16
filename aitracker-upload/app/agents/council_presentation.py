"""Controlled summaries expose selections, never free-form model assertions."""
VERSION = "council-evidence-summary-v1"
LIMITATIONS = (
    "Source authenticity remains unverified.",
    "Support or challenge is a model interpretation, not a verified causal effect.",
    "A cited observation does not establish a future outcome.",
)
JUDGE = {
    "bull": "The judge recorded a provisional bull preference. Future outcomes remain unknown.",
    "bear": "The judge recorded a provisional bear preference. Future outcomes remain unknown.",
    "balanced": "The judge recorded a balanced comparison. Future outcomes remain unknown.",
    "insufficient": "The judge abstained. Future outcomes remain unknown.",
}


def summary(role, *, claims=(), preference=None):
    if role == "judge":
        return JUDGE[preference]
    if role not in ("bull", "bear"):
        raise ValueError("Unknown council role")
    return (f"The {role} case cites inspected observations for conditional research." if claims
            else f"No evidence claims were accepted for the {role} case.")
