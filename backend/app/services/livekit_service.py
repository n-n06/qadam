"""Audio calls via LiveKit (SDK chosen in T6). Backend side: join tokens, Egress recording, webhooks.

Recording model: when the first participant joins, LiveKit fires `room_started`; we start an audio-only
Room Composite Egress that writes one OGG file to the shared recordings volume. When the room closes,
`egress_ended` fires and the transcription pipeline starts.
"""
from __future__ import annotations

from ..config import get_settings


def configured() -> bool:
    s = get_settings()
    return bool(s.livekit_api_key and s.livekit_api_secret)


def make_token(room: str, identity: str, name: str) -> str:
    from livekit import api

    s = get_settings()
    return (
        api.AccessToken(s.livekit_api_key, s.livekit_api_secret)
        .with_identity(identity)
        .with_name(name)
        .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True))
        .to_jwt()
    )


async def start_recording(room: str) -> str:
    from livekit import api

    s = get_settings()
    lk = api.LiveKitAPI(s.livekit_api_url, s.livekit_api_key, s.livekit_api_secret)
    try:
        info = await lk.egress.start_room_composite_egress(
            api.RoomCompositeEgressRequest(
                room_name=room,
                audio_only=True,
                # path inside the egress container; the same volume is mounted as RECORDINGS_DIR in the backend
                file_outputs=[
                    api.EncodedFileOutput(
                        file_type=api.EncodedFileType.OGG,
                        filepath="/out/{room_name}-{time}.ogg",
                    )
                ],
            )
        )
        return info.egress_id
    finally:
        await lk.aclose()


async def end_room(room: str) -> None:
    """Close the room for everybody; LiveKit then finalises the egress file and sends `egress_ended`."""
    from livekit import api

    s = get_settings()
    lk = api.LiveKitAPI(s.livekit_api_url, s.livekit_api_key, s.livekit_api_secret)
    try:
        await lk.room.delete_room(api.DeleteRoomRequest(room=room))
    finally:
        await lk.aclose()


def parse_webhook(body: str, auth_header: str):
    from livekit import api

    s = get_settings()
    receiver = api.WebhookReceiver(api.TokenVerifier(s.livekit_api_key, s.livekit_api_secret))
    return receiver.receive(body, auth_header)
