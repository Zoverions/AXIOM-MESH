package consensus

import (
	"testing"
)

func TestVerifyGraphQueryProof(t *testing.T) {
	validQuery := "SELECT * FROM graph"

	// Mathematically valid proof generated for the specific query
	validProofJSON := `{"y":"d1243662ba2bda1b3d1836e9a8cb70b7eb9a0b761fb21652536919156d1804eadbc4d3fe87a26763ba4c1b65bbefa4bd0e6e61847a861245ddbcf4edadb5f7fc22e83a5c3403459cd16cb181970da6fd688ee2951318b22dfbdb134907d5cb24aea5f6e78efbb2d8dccfc19be62e75dd2bdfd55dcc5c3ca7a57f66c26876237cbff6e1e7ef12f7d91b71276e964d2f2ec2b2bd35d260b3d2d18752e70f0eb904397f577bacd086e4514371a931605aa67b4a9c7d1a5eb14e881596047de90fceb1e0e2b87ffdb8a69e91d294ae0e7744e35a41b91a4f604cd269fcf1e7d9b9b254aa6cc70b2a1d2ef8e1b400cb4192ca420c68caa1dddc3388a769c9b40cffe7","t":"a7fbe3a72f983a048b153c36dc4a04385ce168ca5a37de87a06fe53d5f3d604dcb1055f45c2d8ee61e8e3676f6db3dea80e8c7f1b2ae4d72d26ed3e961c6e02a9fa7382bf54a92a257244ea04de47e5b075ea0dc0d078d4c4aa953f28239eb6deb4ce1142e924d62bc5074397b05d35c59ff6ee9b020f28088681e1d993befe1121c6b60a88f29d5222e109ae4a2dffb4abff585316931a8a319a680c637116322e8ce6991803ee9855c62ebe1cfc6b59bf0bec00c0ea01b2338e0e4a9acee39d699058baade1032dbf17a8deb1e5f94766c8a620154054f1316421d649001e763207c109eb97813ef4da2c7feaf7cf2a320e842d1375775243466d7270834fa","r":"7fffffffffffffffe487ed5110b4611a62633145c06e0e68948127044533e63a0105df531d89cd9128a5043cc71a026ef7ca8cd9e69d218d98158536f92f8a1ba7f09ab6b6a8e122f242dabb312f3f637a262174d31bf6b585ffae5b7a035bf6f71c35fdad44cfd2d74f9208be258ff324943328f6722d9ee1003e5c50b1df82cc6d241b0e2ae9cd348b1fd47e9267afc1b2ae91ee51d6cb0e3179ab1042a95dcf6a9483b84b4b36b3861aa7255e4c0278ba3604650c10be19482f23171b671df1cf3b960c074301cd93c1d17603d147dae2aef837a62964ef15e5fb48299b6afcd2879786bcd59aab4b7d66746e626fb6ffc6b4f657c1a2b052cf8045bbdf77"}`

	// Same valid proof but with 0x prefixes
	validProofWithPrefixes := `{"y":"0xd1243662ba2bda1b3d1836e9a8cb70b7eb9a0b761fb21652536919156d1804eadbc4d3fe87a26763ba4c1b65bbefa4bd0e6e61847a861245ddbcf4edadb5f7fc22e83a5c3403459cd16cb181970da6fd688ee2951318b22dfbdb134907d5cb24aea5f6e78efbb2d8dccfc19be62e75dd2bdfd55dcc5c3ca7a57f66c26876237cbff6e1e7ef12f7d91b71276e964d2f2ec2b2bd35d260b3d2d18752e70f0eb904397f577bacd086e4514371a931605aa67b4a9c7d1a5eb14e881596047de90fceb1e0e2b87ffdb8a69e91d294ae0e7744e35a41b91a4f604cd269fcf1e7d9b9b254aa6cc70b2a1d2ef8e1b400cb4192ca420c68caa1dddc3388a769c9b40cffe7","t":"0xa7fbe3a72f983a048b153c36dc4a04385ce168ca5a37de87a06fe53d5f3d604dcb1055f45c2d8ee61e8e3676f6db3dea80e8c7f1b2ae4d72d26ed3e961c6e02a9fa7382bf54a92a257244ea04de47e5b075ea0dc0d078d4c4aa953f28239eb6deb4ce1142e924d62bc5074397b05d35c59ff6ee9b020f28088681e1d993befe1121c6b60a88f29d5222e109ae4a2dffb4abff585316931a8a319a680c637116322e8ce6991803ee9855c62ebe1cfc6b59bf0bec00c0ea01b2338e0e4a9acee39d699058baade1032dbf17a8deb1e5f94766c8a620154054f1316421d649001e763207c109eb97813ef4da2c7feaf7cf2a320e842d1375775243466d7270834fa","r":"0x7fffffffffffffffe487ed5110b4611a62633145c06e0e68948127044533e63a0105df531d89cd9128a5043cc71a026ef7ca8cd9e69d218d98158536f92f8a1ba7f09ab6b6a8e122f242dabb312f3f637a262174d31bf6b585ffae5b7a035bf6f71c35fdad44cfd2d74f9208be258ff324943328f6722d9ee1003e5c50b1df82cc6d241b0e2ae9cd348b1fd47e9267afc1b2ae91ee51d6cb0e3179ab1042a95dcf6a9483b84b4b36b3861aa7255e4c0278ba3604650c10be19482f23171b671df1cf3b960c074301cd93c1d17603d147dae2aef837a62964ef15e5fb48299b6afcd2879786bcd59aab4b7d66746e626fb6ffc6b4f657c1a2b052cf8045bbdf77"}`

	tamperedProofJSON := `{"y":"123456","t":"a7fbe3a72f983a048b153c36dc4a04385ce168ca5a37de87a06fe53d5f3d604dcb1055f45c2d8ee61e8e3676f6db3dea80e8c7f1b2ae4d72d26ed3e961c6e02a9fa7382bf54a92a257244ea04de47e5b075ea0dc0d078d4c4aa953f28239eb6deb4ce1142e924d62bc5074397b05d35c59ff6ee9b020f28088681e1d993befe1121c6b60a88f29d5222e109ae4a2dffb4abff585316931a8a319a680c637116322e8ce6991803ee9855c62ebe1cfc6b59bf0bec00c0ea01b2338e0e4a9acee39d699058baade1032dbf17a8deb1e5f94766c8a620154054f1316421d649001e763207c109eb97813ef4da2c7feaf7cf2a320e842d1375775243466d7270834fa","r":"7fffffffffffffffe487ed5110b4611a62633145c06e0e68948127044533e63a0105df531d89cd9128a5043cc71a026ef7ca8cd9e69d218d98158536f92f8a1ba7f09ab6b6a8e122f242dabb312f3f637a262174d31bf6b585ffae5b7a035bf6f71c35fdad44cfd2d74f9208be258ff324943328f6722d9ee1003e5c50b1df82cc6d241b0e2ae9cd348b1fd47e9267afc1b2ae91ee51d6cb0e3179ab1042a95dcf6a9483b84b4b36b3861aa7255e4c0278ba3604650c10be19482f23171b671df1cf3b960c074301cd93c1d17603d147dae2aef837a62964ef15e5fb48299b6afcd2879786bcd59aab4b7d66746e626fb6ffc6b4f657c1a2b052cf8045bbdf77"}`

	tests := []struct {
		name     string
		query    string
		proof    string
		expected bool
	}{
		{
			name:     "Valid proof",
			query:    validQuery,
			proof:    validProofJSON,
			expected: true,
		},
		{
			name:     "Valid proof with 0x prefixes",
			query:    validQuery,
			proof:    validProofWithPrefixes,
			expected: true,
		},
		{
			name:     "Empty proof",
			query:    validQuery,
			proof:    "",
			expected: false,
		},
		{
			name:     "Invalid JSON",
			query:    validQuery,
			proof:    "{invalid_json}",
			expected: false,
		},
		{
			name:     "Invalid hex values",
			query:    validQuery,
			proof:    `{"y":"not_hex","t":"123","r":"456"}`,
			expected: false,
		},
		{
			name:     "Invalid proof components - wrong query",
			query:    "SELECT * FROM other_graph",
			proof:    validProofJSON,
			expected: false,
		},
		{
			name:     "Invalid proof components - wrong Y",
			query:    validQuery,
			proof:    tamperedProofJSON,
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := VerifyGraphQueryProof(tc.query, tc.proof)
			if result != tc.expected {
				t.Errorf("VerifyGraphQueryProof() = %v, expected %v", result, tc.expected)
			}
		})
	}
}
