package com.anics.nativeapp.player

import androidx.media3.common.Player

/** Ignore seeks before a usable timeline exists instead of jumping to zero for TIME_UNSET. */
internal fun seekPlayback(player: Player, positionMs: Long): Boolean {
    if (!player.isCommandAvailable(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM) ||
        !player.isCurrentMediaItemSeekable || player.duration <= 0L) return false
    player.seekTo(positionMs.coerceIn(0L, player.duration))
    return true
}
