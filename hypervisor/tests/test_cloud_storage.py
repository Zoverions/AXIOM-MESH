from src.recovery.cloud_storage import CloudStorageFactory, AWSS3Provider, MeshStoreProvider


def test_factory_supports_storage_provider_matrix():
    assert isinstance(CloudStorageFactory.get_provider("meshstore"), MeshStoreProvider)
    assert isinstance(CloudStorageFactory.get_provider("ipfs"), MeshStoreProvider)
    assert isinstance(CloudStorageFactory.get_provider("aws-s3"), AWSS3Provider)
    assert isinstance(CloudStorageFactory.get_provider("s3"), AWSS3Provider)
