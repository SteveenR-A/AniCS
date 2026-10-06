package com.anics.nativeapp.player

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.hls.DefaultHlsExtractorFactory
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory

// Downloaded HLS can be TS without AUDs. Detect frame boundaries from H.264 slices.
// Keep IDR-only keyframes: allowing non-IDR frames can corrupt video after a seek.
@OptIn(UnstableApi::class)
internal fun playbackExtractorsFactory() = DefaultExtractorsFactory()
    .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS)

@OptIn(UnstableApi::class)
internal fun playbackHlsExtractorsFactory() = DefaultHlsExtractorFactory(
    DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS, true)
