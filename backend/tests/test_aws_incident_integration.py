import unittest
from unittest.mock import patch

from app.api import incidents


class AwsIncidentIntegrationTests(unittest.TestCase):
    @patch("app.api.incidents.get_incidents_from_aws", return_value=[
        {
            "id": "INC-REAL-1",
            "title": "Real S3-backed incident",
            "service": "checkout",
            "severity": "Sev-1",
            "opened_at": "10:00 UTC",
            "stage": "awaiting_engineer_review",
            "dlq_count": 21,
            "headline": "Queue is backing up in the real AWS table",
        }
    ])
    def test_list_incidents_prefers_aws_data(self, mock_get):
        incidents_obj = incidents.list_incidents()

        self.assertEqual(incidents_obj, [{
            "id": "INC-REAL-1",
            "title": "Real S3-backed incident",
            "service": "checkout",
            "severity": "Sev-1",
            "opened_at": "10:00 UTC",
            "stage": "awaiting_engineer_review",
            "dlq_count": 21,
            "headline": "Queue is backing up in the real AWS table",
        }])
        mock_get.assert_called_once()

    @patch("app.api.incidents.get_incident_from_aws", return_value={
        "id": "INC-REAL-2",
        "title": "Real AWS incident detail",
        "service": "checkout",
        "severity": "Sev-2",
        "opened_at": "11:00 UTC",
        "window": "10:45 - 11:15",
        "stage": "analysing",
        "services_touched": 2,
        "dlq_count": 7,
        "signals": [],
        "replay": {"tied_to_incident": 7, "replayed": 0, "succeeded": 0, "failed": 0, "remaining": 7},
        "evidence": [],
        "rca": None,
        "proposal": None,
        "validation": None,
    })
    def test_get_incident_prefers_aws_data(self, mock_get):
        incident = incidents.get_incident("INC-REAL-2")

        self.assertEqual(incident["id"], "INC-REAL-2")
        self.assertEqual(incident["title"], "Real AWS incident detail")
        self.assertEqual(incident["stage"], "analysing")
        mock_get.assert_called_once_with("INC-REAL-2")


if __name__ == "__main__":
    unittest.main()
