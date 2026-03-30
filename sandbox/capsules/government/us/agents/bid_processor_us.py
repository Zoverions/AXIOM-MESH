class USBidProcessor:
    def __init__(self, jurisdiction_mode: str = "Federal"):
        """
        Initializes the US Bid Processor.
        jurisdiction_mode: 'Federal' or 'State'
        """
        if jurisdiction_mode not in ["Federal", "State"]:
            raise ValueError("jurisdiction_mode must be 'Federal' or 'State'")
        self.jurisdiction_mode = jurisdiction_mode

    def process_bid(self, bid_data: dict) -> dict:
        """
        Evaluates the bid based on federal or state requirements.
        """
        # Common checks
        if "requestedAmount" not in bid_data or bid_data["requestedAmount"] <= 0:
            return {"status": "Rejected", "reason": "Invalid or missing requestedAmount. Must be > 0."}

        if "jurisdiction" not in bid_data:
            return {"status": "Rejected", "reason": "Missing jurisdiction in bid_data."}

        bid_jurisdiction = bid_data["jurisdiction"]
        if bid_jurisdiction not in ["Federal", "State"]:
            return {"status": "Rejected", "reason": "Jurisdiction must be 'Federal' or 'State'."}

        # Check against processor mode
        if self.jurisdiction_mode == "Federal" and bid_jurisdiction != "Federal":
            return {"status": "Rejected", "reason": "Federal processor cannot process State bids."}
        elif self.jurisdiction_mode == "State" and bid_jurisdiction != "State":
            return {"status": "Rejected", "reason": "State processor cannot process Federal bids."}

        # Jurisdiction-specific checks
        if bid_jurisdiction == "State":
            if "state" not in bid_data:
                return {"status": "Rejected", "reason": "State jurisdiction requires a 'state' code."}

            state_code = bid_data["state"]

            # Specific state logic overrides
            if state_code == "CA":
                return self._process_california_bid(bid_data)
            else:
                return {"status": "Approved", "reason": f"Standard state bid approved for {state_code}."}

        return {"status": "Approved", "reason": "Federal bid approved."}

    def _process_california_bid(self, bid_data: dict) -> dict:
        """
        Specific logic for California (CA) state bids.
        Requires CEQA compliance check and other state overlays.
        """
        # E.g., check for California Environmental Quality Act (CEQA) compliance flag if amount is high
        if bid_data["requestedAmount"] > 100000:
            if not bid_data.get("ceqa_compliant", False):
                 return {"status": "Rejected", "reason": "California bids over $100k require CEQA compliance."}

        return {"status": "Approved", "reason": "California state bid approved."}
