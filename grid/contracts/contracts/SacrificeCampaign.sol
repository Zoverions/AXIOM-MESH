// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./CognitiveFrictionVerifier.sol";
import "./UniversalDistributionPool.sol";
import "./FounderShareManager.sol";
import "./SacrificerNFT.sol";   // new NFT contract below

contract SacrificeCampaign is ReentrancyGuard {
    CognitiveFrictionVerifier public poerVerifier;
    UniversalDistributionPool public ubiPool;
    FounderShareManager public founderManager;
    SacrificerNFT public sacrificerNFT;

    // Message constants (freedom, open source, collective good)
    string public constant SACRIFICE_MESSAGE =
        "I sacrifice to AXIOM-MESH for freedom, open source, collective benefit, and system stability. No expectation of return.";

    mapping(address => uint256) public sacrificeAmount;
    mapping(address => bool) public hasReceivedNFT;

    event Sacrificed(address indexed donor, uint256 amount, string message);
    event RecognitionNFTMinted(address indexed donor, uint256 tokenId);

    constructor(
        address _poer,
        address payable _ubiPool,
        address _founderManager,
        address _sacrificerNFT
    ) {
        poerVerifier = CognitiveFrictionVerifier(_poer);
        ubiPool = UniversalDistributionPool(_ubiPool);
        founderManager = FounderShareManager(_founderManager);
        sacrificerNFT = SacrificerNFT(_sacrificerNFT);
    }

    receive() external payable {}

    function sacrifice() external payable nonReentrant {
        require(msg.value > 0, "Sacrifice must be > 0");

        sacrificeAmount[msg.sender] += msg.value;

        // Auto-allocate (50% UBI, 50% Guardian Reserve)
        uint256 ubiAmount = msg.value / 2;
        uint256 guardianAmount = msg.value - ubiAmount;

        payable(address(ubiPool)).transfer(ubiAmount);

        payable(founderManager.guardianSentinel()).transfer(guardianAmount);

        emit Sacrificed(msg.sender, msg.value, SACRIFICE_MESSAGE);

        // Optional NFT recognition (one-time per donor)
        if (!hasReceivedNFT[msg.sender]) {
            uint256 tokenId = sacrificerNFT.totalSupply();
            sacrificerNFT.mintRecognition(msg.sender);
            hasReceivedNFT[msg.sender] = true;
            emit RecognitionNFTMinted(msg.sender, tokenId);

            // Integrate with PoER boost (Educational Node & Digital Entity Core)
            // As per instructions: "SacrificeCampaign automatically grants recognition NFTs and PoER boosts to sacrificers."
            // Assuming CognitiveFrictionVerifier acts as the PoER verifier base.
            uint256 currentScore = poerVerifier.poerScores(msg.sender);
            poerVerifier.updatePoERScore(msg.sender, currentScore + 100);
        }
    }
}
