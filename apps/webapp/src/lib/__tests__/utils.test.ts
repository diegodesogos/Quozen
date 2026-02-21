import { describe, it, expect } from 'vitest';
import { parseMembers } from '../utils';

describe('parseMembers', () => {
  it('parses empty string as empty array', () => {
    expect(parseMembers("")).toEqual([]);
    expect(parseMembers("   ")).toEqual([]);
  });

  it('parses valid emails', () => {
    const result = parseMembers("test@example.com, other@domain.org");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ email: "test@example.com" });
    expect(result[1]).toEqual({ email: "other@domain.org" });
  });

  it('parses usernames', () => {
    const result = parseMembers("user1, user2");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ username: "user1" });
    expect(result[1]).toEqual({ username: "user2" });
  });

  it('parses mixed emails and usernames', () => {
    const result = parseMembers("user1, test@example.com, user2");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ username: "user1" });
    expect(result[1]).toEqual({ email: "test@example.com" });
    expect(result[2]).toEqual({ username: "user2" });
  });

  it('ignores empty segments', () => {
    const result = parseMembers("user1, , user2");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ username: "user1" });
    expect(result[1]).toEqual({ username: "user2" });
  });
});
