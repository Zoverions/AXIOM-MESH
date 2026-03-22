const fs = require('fs');
const path = require('path');

const managerPath = path.join(__dirname, 'node_modules', '@uniswap', 'v3-periphery', 'contracts', 'interfaces', 'INonfungiblePositionManager.sol');
let managerCode = fs.readFileSync(managerPath, 'utf8');
managerCode = managerCode.replace('@openzeppelin/contracts/token/ERC721/IERC721Metadata.sol', '@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol');
managerCode = managerCode.replace('@openzeppelin/contracts/token/ERC721/IERC721Enumerable.sol', '@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol');
fs.writeFileSync(managerPath, managerCode);

const poolPath = path.join(__dirname, 'node_modules', '@uniswap', 'v3-periphery', 'contracts', 'libraries', 'PoolAddress.sol');
let poolCode = fs.readFileSync(poolPath, 'utf8');
poolCode = poolCode.replace(
`        pool = address(
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
        );`,
`        pool = address(
            uint160(uint256(
                keccak256(
                    abi.encodePacked(
                        hex'ff',
                        factory,
                        keccak256(abi.encode(key.token0, key.token1, key.fee)),
                        POOL_INIT_CODE_HASH
                    )
                )
            ))
        );`
);
fs.writeFileSync(poolPath, poolCode);
