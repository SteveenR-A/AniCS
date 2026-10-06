package com.anics.nativeapp

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.DataReader
import androidx.media3.common.Format
import androidx.media3.common.util.ParsableByteArray
import androidx.media3.common.util.UnstableApi
import androidx.media3.extractor.*
import androidx.media3.extractor.ts.TsExtractor
import com.anics.nativeapp.player.playbackExtractorsFactory
import java.io.ByteArrayInputStream
import java.util.Base64
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(UnstableApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaybackTsSeekTest {
    private data class Sample(val timeUs: Long, val flags: Int)
    private class Track : TrackOutput {
        val samples = mutableListOf<Sample>()
        override fun format(format: Format) {}
        override fun sampleData(input: DataReader, length: Int, allowEndOfInput: Boolean, sampleDataPart: Int): Int =
            input.read(ByteArray(length), 0, length)
        override fun sampleData(data: ParsableByteArray, length: Int, sampleDataPart: Int) { data.skipBytes(length) }
        override fun sampleMetadata(timeUs: Long, flags: Int, size: Int, offset: Int, cryptoData: TrackOutput.CryptoData?) {
            samples.add(Sample(timeUs, flags))
        }
    }

    @Test fun noAudTransportStreamStillProducesVideoAndAudioAfterForwardAndBackwardSeeks() {
        val data = javaClass.getResourceAsStream("/player/no-aud.ts.base64")!!.use { Base64.getMimeDecoder().decode(it.readBytes()) }
        val tracks = mutableMapOf<Int, Track>()
        var seekMap: SeekMap? = null
        val extractor = playbackExtractorsFactory().createExtractors().filterIsInstance<TsExtractor>().single()
        extractor.init(object : ExtractorOutput {
            override fun track(id: Int, type: Int): TrackOutput = tracks.getOrPut(type) { Track() }
            override fun endTracks() {}
            override fun seekMap(map: SeekMap) { seekMap = map }
        })
        fun input(position: Long): DefaultExtractorInput {
            val stream = ByteArrayInputStream(data, position.toInt(), data.size - position.toInt())
            return DefaultExtractorInput(DataReader { buffer, offset, length -> stream.read(buffer, offset, length) }, position, data.size.toLong())
        }
        fun readFrom(position: Long) {
            var current = input(position)
            val holder = PositionHolder()
            repeat(10_000) {
                when (extractor.read(current, holder)) {
                    Extractor.RESULT_END_OF_INPUT -> return
                    Extractor.RESULT_SEEK -> current = input(holder.position)
                }
            }
            fail("TS extraction did not finish")
        }
        try {
            readFrom(0)
            val video = tracks[C.TRACK_TYPE_VIDEO]!!
            val audio = tracks[C.TRACK_TYPE_AUDIO]!!
            assertTrue("Missing video samples without AUDs", video.samples.size > 4)
            assertTrue(audio.samples.isNotEmpty())
            assertTrue(seekMap!!.isSeekable)
            for (target in listOf(3_000_000L, 1_000_000L, 4_000_000L)) {
                video.samples.clear(); audio.samples.clear()
                val point = seekMap!!.getSeekPoints(target).first
                extractor.seek(point.position, target)
                readFrom(point.position)
                assertTrue("No video after seek to $target", video.samples.any { it.timeUs >= target })
                assertTrue("No audio after seek to $target", audio.samples.any { it.timeUs >= target })
                assertTrue("No decodable keyframe after seek", video.samples.any { it.flags and C.BUFFER_FLAG_KEY_FRAME != 0 })
                assertTrue(video.samples.zipWithNext().all { (a, b) -> a.timeUs <= b.timeUs })
            }
        } finally { extractor.release() }
    }
}
