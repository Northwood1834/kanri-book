# Data and compatibility contract

Portable backup and future cross-app consolidation are specified in
[`BACKUP_DESIGN.md`](BACKUP_DESIGN.md).

## Storage envelope

`管理ブック` stores data in the same-origin IndexedDB database
`kanri-book-vault`, object store `secure`.

Two records are used:

- `device-key`: a non-extractable 256-bit AES-GCM `CryptoKey`
- `vault`: the versioned encrypted envelope

The `vault` record exposes only:

- `format`: envelope format version (`2`)
- `cipher`: `AES-256-GCM`
- `key`: `non-extractable-device-key`
- `gate`: random IV and ciphertext for the emoji sequence
- `payload`: independently random IV and ciphertext for the notebook
- `updatedAt`: write timestamp

Both ciphertexts use 96-bit random IVs, 128-bit authentication tags, and
versioned Additional Authenticated Data. See [`SECURITY.md`](SECURITY.md).

The decrypted document has `schema: "kanri-book"` and `schemaVersion: 1`.
Its top-level collections are `lines`, `sets`, and `devices`. Stable random IDs
are used for all entities. A line refers to a set through `setId`, a device
through `deviceId`, and a 回線チェック profile through
`links.kaisenCheckProfileId`.

## 回線チェック compatibility

When both apps are deployed below the same HTTPS origin (for example as two
GitHub Pages project paths under the same user site), 管理ブック may read the
existing 回線チェック keys:

- `simProfiles`: profile objects with stable `id`
- `checkHistory`: check records whose `profileId` references that ID

The selected profile ID is kept only inside the encrypted vault. 管理ブック
treats the 回線チェック keys as read-only and shows its latest check record. No
private 管理ブック field is copied to localStorage.

Different origins cannot share these browser records. A future cross-origin
integration requires an explicit, user-authorized transfer mechanism; placing
phone numbers in unencrypted storage is not compatible with this contract.

## Migration rule

Additive fields may be introduced without changing `schemaVersion`. Any change
that reinterprets or removes an existing field requires a versioned migration
after successful decryption and before the next encrypted write.
