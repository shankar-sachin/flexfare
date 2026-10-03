# Limits and quotas

Enforced on the server in one Firestore transaction.

| Limit | Value |
|---|---|
| Regular searches per user per day | 4 |
| Deep Searches per user per day | 1 |
| Searches per IP per day | 15 |
| Searches across all users per day | 300 |

- The same search within 6 hours is cached and free.
- If our side fails, or nothing is found, the search is refunded.
- Daily limits reset at 00:00 UTC.

## Why a phone number?

It's a speed bump for people making many accounts, and it is not verified. We store only a hash of it. The real protection is the email check plus the IP and global limits.
