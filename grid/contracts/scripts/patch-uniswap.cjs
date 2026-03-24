const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, '..', 'node_modules', '@uniswap', 'v3-periphery', 'contracts');

const positionManagerPath = path.join(basePath, 'interfaces', 'INonfungiblePositionManager.sol');
if (fs.existsSync(positionManagerPath)) {
    let content = fs.readFileSync(positionManagerPath, 'utf8');
    let changed = false;

    if (content.includes('@openzeppelin/contracts/token/ERC721/IERC721Metadata.sol')) {
        content = content.replace(
            /@openzeppelin\/contracts\/token\/ERC721\/IERC721Metadata\.sol/g,
            '@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol'
        );
        changed = true;
    }

    if (content.includes('@openzeppelin/contracts/token/ERC721/IERC721Enumerable.sol')) {
        content = content.replace(
            /@openzeppelin\/contracts\/token\/ERC721\/IERC721Enumerable\.sol/g,
            '@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol'
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(positionManagerPath, content);
        console.log("Patched INonfungiblePositionManager.sol");
    }
} else {
    console.warn("Could not find INonfungiblePositionManager.sol to patch.");
}

const poolAddressPath = path.join(basePath, 'libraries', 'PoolAddress.sol');
if (fs.existsSync(poolAddressPath)) {
    let content = fs.readFileSync(poolAddressPath, 'utf8');

    if (content.includes('pool = address(') && !content.includes('uint160(')) {
        const searchRegex = /pool\s*=\s*address\(\s*uint256\(\s*keccak256\(\s*abi\.encodePacked\(\s*hex'ff',\s*factory,\s*keccak256\(abi\.encode\(key\.token0,\s*key\.token1,\s*key\.fee\)\),\s*POOL_INIT_CODE_HASH\s*\)\s*\)\s*\)\s*\);/g;

        const replacement = `pool = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex'ff',
                            factory,
                            keccak256(abi.encode(key.token0, key.token1, key.fee)),
                            POOL_INIT_CODE_HASH
                        )
                    )
                )
            )
        );`;

        const originalContent = content;
        content = content.replace(searchRegex, replacement);

        if (content !== originalContent) {
            fs.writeFileSync(poolAddressPath, content);
            console.log("Patched PoolAddress.sol successfully.");
        } else {
            if (content.indexOf("pool = address(") > -1 && content.indexOf("uint256(") > -1) {
                content = content.replace(
                    /pool = address\(\s*uint256\(/g,
                    'pool = address(uint160(uint256('
                );

                const splitContent = content.split("POOL_INIT_CODE_HASH");
                if (splitContent.length > 1) {
                    const secondPart = splitContent[1].replace(/\)\s*\)\s*\)\s*;/g, ")\n                    )\n                )\n            )\n        );");
                    content = splitContent[0] + "POOL_INIT_CODE_HASH" + secondPart;
                    fs.writeFileSync(poolAddressPath, content);
                    console.log("Patched PoolAddress.sol with fallback.");
                }
            }
        }
    }
} else {
    console.warn("Could not find PoolAddress.sol to patch.");
}
