const CAMPAIGN_ADDRESS = "0xYOUR_DONATION_CAMPAIGN_CONTRACT_ADDRESS_HERE";

function copyCampaignAddress() {
  navigator.clipboard.writeText(CAMPAIGN_ADDRESS);
  alert("Donation Campaign address copied!");
}

document.getElementById("campaign-address").innerText = CAMPAIGN_ADDRESS;
