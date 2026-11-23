"""Testnet outcomes for the frontend's test bench (M27.7b)"""

from pydantic import BaseModel

from app.models.market import PayoutKind

class TestnetOutcome(BaseModel):
    """One testnet outcome, titled by the same code as mainnet markets
    
    No prices: the ticket reads live books from testnet directly
    """

    id: str
    title: str
    sides: list[str]    # display names of side 0 and side 1
    payout: PayoutKind
