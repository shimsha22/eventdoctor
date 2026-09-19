from abc import ABC, abstractmethod
from app.models.schemas import EvidencePackage, RCAResult

class AIProvider(ABC):
    @abstractmethod
    def generate_rca(self, evidence: EvidencePackage) -> RCAResult:
        """Takes an evidence package and returns a structured Root Cause Analysis."""
        pass