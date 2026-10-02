// Standalone JVM compatibility check; no Android SDK or production credentials.
import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

private fun keyFromPin(pin: String, salt: ByteArray): SecretKeySpec {
    val spec = PBEKeySpec(pin.toCharArray(), salt, 100_000, 256)
    return try {
        SecretKeySpec(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded, "AES")
    } finally {
        spec.clearPassword()
    }
}

private fun decrypt(encoded: String, key: SecretKeySpec): String {
    val combined = Base64.getDecoder().decode(encoded)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, combined.copyOfRange(0, 12)))
    return String(cipher.doFinal(combined.copyOfRange(12, combined.size)), UTF_8)
}

private fun mustReject(action: () -> Unit) {
    try {
        action()
    } catch (_: AEADBadTagException) {
        return
    }
    error("Invalid ciphertext/key was accepted")
}

fun main(args: Array<String>) {
    require(args.size == 7) { "Run check-crypto-contract.ps1 to supply the JSON fixture" }
    val (pin, wrongPin, saltBase64, ivBase64, plaintextBase64) = args
    val plaintext = String(Base64.getDecoder().decode(plaintextBase64), UTF_8)
    val expectedCiphertext = args[5]
    val expectedHash = args[6]
    val salt = Base64.getDecoder().decode(saltBase64)
    val iv = Base64.getDecoder().decode(ivBase64)
    val key = keyFromPin(pin, salt)

    check(decrypt(expectedCiphertext, key) == plaintext) { "Decryption differs from Web Crypto" }
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, iv))
    // Fixed IV only for this synthetic vector; Android production must use randomness.
    val encoded = Base64.getEncoder().encodeToString(iv + cipher.doFinal(plaintext.toByteArray(UTF_8)))
    check(encoded == expectedCiphertext) { "Encryption layout differs from Web Crypto" }

    mustReject { decrypt(expectedCiphertext, keyFromPin(wrongPin, salt)) }
    val tampered = Base64.getDecoder().decode(expectedCiphertext)
    tampered[tampered.lastIndex] = (tampered.last().toInt() xor 1).toByte()
    mustReject { decrypt(Base64.getEncoder().encodeToString(tampered), key) }

    val hash = MessageDigest.getInstance("SHA-256").digest(plaintext.toByteArray(UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    check(hash == expectedHash) { "UTF-8 hash differs from Web Crypto" }
    println("4 crypto contract checks passed (Kotlin/JDK)")
}
