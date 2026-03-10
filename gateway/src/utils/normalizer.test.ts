import { normalizeInput } from './normalizer';
import { v4 as uuidv4 } from 'uuid';

jest.mock('uuid', () => ({
  v4: jest.fn()
}));

describe('normalizeInput', () => {
  const FIXED_TIMESTAMP = 1234567890;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_TIMESTAMP);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a properly structured IntentObject with default metadata', () => {
    const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
    (uuidv4 as jest.Mock).mockReturnValue(mockUuid);

    const channel = 'discord';
    const content = 'Hello world';

    const result = normalizeInput(channel, content);

    expect(result).toEqual({
      id: mockUuid,
      channel,
      content,
      metadata: {},
      timestamp: FIXED_TIMESTAMP
    });

    expect(uuidv4).toHaveBeenCalledTimes(1);
  });

  it('should include provided metadata', () => {
    const mockUuid = '123e4567-e89b-12d3-a456-426614174001';
    (uuidv4 as jest.Mock).mockReturnValue(mockUuid);

    const channel = 'whatsapp';
    const content = 'Test message';
    const metadata = { userId: 'user-123', isCommand: true };

    const result = normalizeInput(channel, content, metadata);

    expect(result).toEqual({
      id: mockUuid,
      channel,
      content,
      metadata,
      timestamp: FIXED_TIMESTAMP
    });
  });
});
