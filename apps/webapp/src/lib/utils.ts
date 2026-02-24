import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { MemberInput } from "@quozen/core"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const parseMembers = (input: string): MemberInput[] => {
  if (!input.trim()) return [];

  return input.split(',')
    .map(item => {
      const trimmed = item.trim();
      if (!trimmed) return null;
      const isEmail = trimmed.includes('@') && trimmed.includes('.');

      if (isEmail) {
        return { email: trimmed } as MemberInput;
      } else {
        return { username: trimmed } as MemberInput;
      }
    })
    .filter((m): m is MemberInput => m !== null);
};
