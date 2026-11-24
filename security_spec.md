# AINEMAX Security Specification (Phases 2 & 3)

## 1. Data Invariants
1. **Identity Integrity**: User profiles, posts, comments, likes, follows, friend requests, blocks, and reports must strictly match `request.auth.uid`.
2. **No Self-Verification or Self-Moderation**: Only verified administrators (`isAdmin()`) may modify `isVerified` or `accountStatus`. `posts.authorVerified` and `comments.authorVerified` are verified against `/users/{uid}.isVerified` on creation.
3. **Strict PII Isolation**: Email, phone number, and privacy settings remain exclusively in `/users/{userId}/private/info`.
4. **Atomic Counter & Graph Synchronization (`existsAfter` / `getAfter`)**:
   - Creating/deleting `/posts/{postId}` atomically increments/decrements `/users/{uid}.postsCount` by 1.
   - Creating/deleting `/likes/{postId}_{uid}` atomically increments/decrements `/posts/{postId}.likesCount` by 1.
   - Creating/deleting `/comments/{commentId}` atomically increments/decrements `/posts/{postId}.commentsCount` by 1.
   - Creating/deleting `/follows/{followerId}_{followingId}` prevents self-follows (`followerId != followingId`), prevents duplicate follow documents via deterministic key `{followerId}_{followingId}`, and atomically updates both `followersCount` and `followingCount`.
5. **Terminal State Locking**: Once a `friendRequests` document reaches `accepted` or `rejected`, non-admin clients cannot rewrite its status to `pending`; once a `reports` document leaves `pending`, non-admin clients cannot alter it.
6. **Zero-Trust List Queries**: Every `allow list` evaluates `resource.data` directly with zero `get()` or `exists()` calls.

## 2. Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated write to `/posts`, `/comments`, `/likes`, `/follows`, `/reports`.
2. Creating a post with `authorId` set to another user's UID or `authorVerified: true` when user is unverified.
3. Incrementing `/posts/{postId}.likesCount` directly without creating `/likes/{postId}_{uid}`.
4. Creating a duplicate or non-deterministic `/follows` document ID (e.g. `randomId` instead of `{followerId}_{followingId}`), or following yourself.
5. Reading or listing another user's `/blocks` or `/friendRequests` or `/users/{userId}/private/info`.
6. Editing another user's post or modifying `likesCount`/`commentsCount` during a caption edit.
7. Submitting a report with `status: 'resolved'` directly from a client.
8. Injecting shadow/ghost fields on any create or update.
