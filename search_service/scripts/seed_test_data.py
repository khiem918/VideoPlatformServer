"""
Script tạo dữ liệu test đa chủ đề cho việc so sánh Dense vs Sparse vs Hybrid search.

Không dùng video thật — text được đưa trực tiếp vào pipeline, bỏ qua bước
download R2 / ffmpeg / Whisper. Mỗi "video" giả gồm vài chunk thuộc 1 chủ đề
riêng biệt, giúp tạo đủ "nhiễu" (chunk không liên quan) để so sánh có ý nghĩa
giữa 3 phương pháp search.

Cách chạy (từ thư mục gốc của search_service, để import đúng theo package `src`):
    python -m scripts.seed_test_data
hoặc chỉnh sys.path / PYTHONPATH cho phù hợp với cấu trúc project của bạn.

LƯU Ý: nếu bạn đã seed dữ liệu trước khi có bản sửa normalize_transcript_text
(xử lý dấu tiếng Việt), cần xóa collection cũ trước khi chạy lại script này,
để tránh vector index cũ (chưa qua normalize đúng) lẫn với vector mới:
    curl -X DELETE http://localhost:6333/collections/video_chunks
"""

import asyncio
import logging
import time

from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.domain.service.normalize import normalize_transcript_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEST_USER_OWNER = "test_user_seed"

# ─────────────────────────────────────────────
# Dữ liệu test: 5 video giả (video thứ 6 "thời tiết" dùng lại data cũ đã có)
# ─────────────────────────────────────────────

TEST_VIDEOS = [
    {
        "video_id": "test_video_cooking_pho",
        "topic": "Nấu ăn - Phở bò",
        "chunks": [
            {
                "start": 0.0, "end": 25.0,
                "text": "Hôm nay mình sẽ hướng dẫn các bạn nấu phở bò truyền thống. "
                        "Đầu tiên cần chuẩn bị xương bò, hành tây nướng và gừng nướng để nước dùng thơm.",
            },
            {
                "start": 25.0, "end": 50.0,
                "text": "Nước dùng phở phải ninh xương trong ít nhất 6 tiếng, thường xuyên hớt bọt "
                        "để nước trong. Gia vị chính gồm quế, hồi, thảo quả và đinh hương.",
            },
            {
                "start": 50.0, "end": 75.0,
                "text": "Khi ăn, trụng bánh phở qua nước sôi, xếp thịt bò tái hoặc chín lên trên, "
                        "chan nước dùng nóng và ăn kèm rau thơm, giá đỗ, chanh ớt.",
            },
        ],
    },
    {
        "video_id": "test_video_travel_japan",
        "topic": "Travel - Japan",
        "chunks": [
            {
                "start": 0.0, "end": 25.0,
                "text": "Welcome back to the channel! Today we're exploring Kyoto, one of the most "
                        "beautiful cities in Japan, famous for its temples and traditional wooden houses.",
            },
            {
                "start": 25.0, "end": 50.0,
                "text": "The best time to visit Japan is during cherry blossom season in late March "
                        "to early April, when sakura trees bloom across the country.",
            },
            {
                "start": 50.0, "end": 75.0,
                "text": "Don't miss trying authentic ramen and sushi at local shops, and make sure "
                        "to get a JR Pass if you're planning to travel between multiple cities by train.",
            },
        ],
    },
    {
        "video_id": "test_video_sports_football",
        "topic": "Bóng đá - Bình luận trận đấu",
        "chunks": [
            {
                "start": 0.0, "end": 25.0,
                "text": "Trận đấu tối nay giữa hai đội bóng hàng đầu diễn ra vô cùng kịch tính, "
                        "tỷ số hòa 1-1 sau hiệp một với nhiều pha bóng nguy hiểm.",
            },
            {
                "start": 25.0, "end": 50.0,
                "text": "Sang hiệp hai, đội chủ nhà đẩy cao đội hình tấn công, tận dụng tốt các "
                        "pha phản công nhanh và ghi thêm hai bàn thắng nhờ những đường chuyền chính xác.",
            },
            {
                "start": 50.0, "end": 75.0,
                "text": "Huấn luyện viên trưởng chia sẻ sau trận đấu rằng chiến thuật pressing tầm cao "
                        "đã phát huy hiệu quả, giúp đội giành trọn 3 điểm quan trọng.",
            },
        ],
    },
    {
        "video_id": "test_video_tech_ai",
        "topic": "Technology - AI",
        "chunks": [
            {
                "start": 0.0, "end": 25.0,
                "text": "Artificial intelligence has rapidly transformed how we build software, "
                        "with large language models now capable of writing code and answering complex questions.",
            },
            {
                "start": 25.0, "end": 50.0,
                "text": "Machine learning models require large amounts of training data and "
                        "computational power, often relying on GPUs or specialized hardware like TPUs.",
            },
            {
                "start": 50.0, "end": 75.0,
                "text": "Vector databases such as Qdrant are increasingly used to power semantic search, "
                        "storing embeddings that capture the meaning of text rather than exact keywords.",
            },
        ],
    },
    {
        "video_id": "test_video_music_guitar",
        "topic": "Âm nhạc - Học guitar",
        "chunks": [
            {
                "start": 0.0, "end": 25.0,
                "text": "Chào mừng các bạn đến với video học guitar cơ bản. Hôm nay chúng ta sẽ "
                        "học cách bấm hợp âm Am, C, F và G, những hợp âm phổ biến nhất khi mới bắt đầu.",
            },
            {
                "start": 25.0, "end": 50.0,
                "text": "Practice switching between chords slowly at first, then gradually increase "
                        "your speed. A metronome can really help you keep a steady rhythm.",
            },
            {
                "start": 50.0, "end": 75.0,
                "text": "Sau khi thành thạo các hợp âm cơ bản, bạn có thể tập chơi các bài hát đơn giản "
                        "để luyện phản xạ tay và cảm âm tốt hơn.",
            },
        ],
    },
]


async def seed():
    embedding = EmbeddingService()
    embedding.load_model()

    chunk_qdrant = ChunkQdrantService()
    await chunk_qdrant.init_collection()

    for video in TEST_VIDEOS:
        created_at = int(time.time())
        chunks = [
            {
                "text":       c["text"],
                "start":      c["start"],
                "end":        c["end"],
                "video_id":   video["video_id"],
                "user_owner": TEST_USER_OWNER,
                "source":     "audio",
                "created_at": created_at,
            }
            for c in video["chunks"]
        ]

        # Chuẩn hóa text (giữ dấu tiếng Việt) trước khi embed, đúng như
        # video_processing_service.py — payload chunks vẫn giữ text gốc để hiển thị.
        texts_for_embedding = [normalize_transcript_text(c["text"]) for c in chunks]
        dense_vectors  = [await embedding.embed_dense(t) for t in texts_for_embedding]
        sparse_vectors = [await embedding.embed_sparse(t) for t in texts_for_embedding]

        await chunk_qdrant.upsert_chunks(chunks, dense_vectors, sparse_vectors)
        logger.info(f"Seeded {len(chunks)} chunks cho video '{video['video_id']}' ({video['topic']})")

    logger.info(
        f"Hoàn tất seed {len(TEST_VIDEOS)} video test "
        f"({sum(len(v['chunks']) for v in TEST_VIDEOS)} chunk) vào collection video_chunks."
    )


if __name__ == "__main__":
    asyncio.run(seed())