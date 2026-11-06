"""Lecture des vidéos, messages et ambiance TV."""
import os


def tv(client):
    return client.get("/api/public/state").json()["tv"]


def test_loop_video_described(client):
    loop = tv(client)["loop"]
    assert loop["id"] == "loop_bureau"
    assert loop["url"].startswith("/media/videos/00_loop_bureau.mp4?v=")
    assert loop["available"] is True


def test_video_url_changes_when_file_replaced(client):
    before = tv(client)["loop"]["url"]
    path = client.app.state.services.game.media_dir / "videos" / "00_loop_bureau.mp4"
    st = path.stat()
    os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 5_000_000_000))
    assert tv(client)["loop"]["url"] != before


def test_play_available_and_missing_video(admin):
    admin.post("/api/admin/tv/play", json={"video_id": "victoire"})
    play = tv(admin)["play"]
    assert play["video"]["available"] is True
    admin.post("/api/admin/tv/play", json={"video_id": "relance"})
    play = tv(admin)["play"]
    assert play["video"]["id"] == "relance"
    assert play["video"]["available"] is False
    assert play["video"]["fallback_text"]
    assert play["video"]["fallback_seconds"] >= 2


def test_new_play_replaces_current_one(admin):
    a = admin.post("/api/admin/tv/play", json={"video_id": "relance"}).json()["play_id"]
    b = admin.post("/api/admin/tv/play", json={"video_id": "alerte"}).json()["play_id"]
    assert a != b
    assert tv(admin)["play"]["play_id"] == b
    # La fin de l'ancienne lecture n'interrompt pas la nouvelle.
    assert admin.post("/api/tv/ended", json={"play_id": a}).json()["changed"] is False
    assert tv(admin)["play"]["play_id"] == b


def test_rapid_double_click_debounced(admin, clock):
    first = admin.post("/api/admin/tv/play", json={"video_id": "relance"}).json()
    second = admin.post("/api/admin/tv/play", json={"video_id": "relance"}).json()
    assert second["changed"] is False and second["play_id"] == first["play_id"]
    clock.advance(seconds=5)
    third = admin.post("/api/admin/tv/play", json={"video_id": "relance"}).json()
    assert third["changed"] is True


def test_stop_returns_to_loop(admin):
    admin.post("/api/admin/tv/play", json={"video_id": "alerte"})
    admin.post("/api/admin/tv/stop")
    assert tv(admin)["play"] is None


def test_unknown_or_loop_video_rejected(admin):
    assert admin.post("/api/admin/tv/play", json={"video_id": "inconnue"}).status_code == 404
    assert admin.post("/api/admin/tv/play", json={"video_id": "loop_bureau"}).status_code == 422


def test_media_served_with_range_support(client):
    r = client.get("/media/videos/00_loop_bureau.mp4", headers={"Range": "bytes=0-9"})
    assert r.status_code == 206
    assert len(r.content) == 10
    assert client.get("/media/videos/absente.mp4").status_code == 404


def test_messages(admin, clock):
    admin.post("/api/admin/tv/message", json={"message_id": "courage"})
    msg = tv(admin)["message"]
    assert msg["text"].startswith("Courage")
    admin.post("/api/admin/tv/message", json={"text": "Message libre", "duration": 5})
    assert tv(admin)["message"]["text"] == "Message libre"
    clock.advance(seconds=6)
    assert tv(admin)["message"] is None
    assert admin.post("/api/admin/tv/message", json={"text": "   "}).status_code == 422
    assert admin.post("/api/admin/tv/message", json={"message_id": "nope"}).status_code == 404


def test_clear_message_and_ambient(admin):
    admin.post("/api/admin/tv/message", json={"message_id": "courage"})
    admin.post("/api/admin/tv/message/clear")
    assert tv(admin)["message"] is None
    admin.post("/api/admin/tv/ambient", json={"ambient": "etoiles"})
    assert tv(admin)["ambient"] == "etoiles"
    assert admin.post("/api/admin/tv/ambient", json={"ambient": "disco"}).status_code == 422
