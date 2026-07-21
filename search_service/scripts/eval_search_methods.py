"""
Script đánh giá so sánh Dense vs Sparse (BM25) vs Hybrid (RRF) search
trên collection video_chunks, dùng bộ query + ground truth đã soạn.

Cách chạy (từ thư mục gốc search_service):
    python -m scripts.eval_search_methods

Yêu cầu: đã chạy scripts/seed_test_data.py trước đó để có dữ liệu test
trong collection video_chunks.
"""

import asyncio
import json
import logging
import os

from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.domain.service.normalize import normalize_transcript_text
from scripts.seed_test_data import TEST_USER_OWNER

logging.basicConfig(level=logging.WARNING)  # tắt bớt log info của model loading
logger = logging.getLogger(__name__)

GROUND_TRUTH_PATH = os.path.join(os.path.dirname(__file__), "ground_truth.json")

TOP_K = 3          # dùng cho Precision@k, Recall@k
RETRIEVE_LIMIT = 10  # lấy nhiều hơn TOP_K để MRR tính đúng cả khi relevant chunk xếp hạng thấp


# ─────────────────────────────────────────────
# Metrics
# ─────────────────────────────────────────────

def precision_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    top_k = retrieved_ids[:k]
    if k == 0:
        return 0.0
    hits = sum(1 for rid in top_k if rid in relevant_ids)
    return hits / k


def recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    if not relevant_ids:
        return 0.0
    top_k = retrieved_ids[:k]
    hits = sum(1 for rid in top_k if rid in relevant_ids)
    return hits / len(relevant_ids)


def reciprocal_rank(retrieved_ids: list[str], relevant_ids: set[str]) -> float:
    for rank, rid in enumerate(retrieved_ids, start=1):
        if rid in relevant_ids:
            return 1.0 / rank
    return 0.0


# ─────────────────────────────────────────────
# Đánh giá
# ─────────────────────────────────────────────

async def evaluate():
    with open(GROUND_TRUTH_PATH, encoding="utf-8") as f:
        ground_truth = json.load(f)

    embedding = EmbeddingService()
    embedding.load_model()

    chunk_qdrant = ChunkQdrantService()

    # Gom kết quả từng phương pháp: method -> list[dict(precision, recall, rr)]
    results = {"dense": [], "sparse": [], "hybrid": []}

    print(f"{'ID':<5} {'Chủ đề':<10} {'Query'}")
    print("-" * 80)

    for q in ground_truth["queries"]:
        query_id = q["id"]
        topic = q["topic"]
        raw_query = q["query"]
        relevant_ids = set(q["relevant_chunk_ids"])

        print(f"{query_id:<5} {topic:<10} {raw_query}")

        # Chuẩn hóa giống hệt pipeline search.py (giữ dấu tiếng Việt)
        normalized_query = normalize_transcript_text(raw_query)

        dense_vector = await embedding.embed_query(normalized_query)
        sparse_vector = await embedding.embed_sparse(normalized_query)

        # ── Dense-only ──
        dense_points = await chunk_qdrant.search_chunks(
            query_vector=dense_vector,
            limit=RETRIEVE_LIMIT,
            filter_by_user=TEST_USER_OWNER,
        )
        dense_ids = [p.id for p in dense_points]

        # ── Sparse-only ──
        sparse_points = await chunk_qdrant.search_chunks_sparse(
            query_sparse_vector=sparse_vector,
            limit=RETRIEVE_LIMIT,
            filter_by_user=TEST_USER_OWNER,
        )
        sparse_ids = [p.id for p in sparse_points]

        # ── Hybrid (RRF) ──
        hybrid_points = await chunk_qdrant.search_chunks_hybrid(
            query_dense_vector=dense_vector,
            query_sparse_vector=sparse_vector,
            limit=RETRIEVE_LIMIT,
            filter_by_user=TEST_USER_OWNER,
        )
        hybrid_ids = [p.id for p in hybrid_points]

        for method, retrieved_ids in [
            ("dense", dense_ids),
            ("sparse", sparse_ids),
            ("hybrid", hybrid_ids),
        ]:
            results[method].append({
                "query_id": query_id,
                "precision": precision_at_k(retrieved_ids, relevant_ids, TOP_K),
                "recall": recall_at_k(retrieved_ids, relevant_ids, TOP_K),
                "rr": reciprocal_rank(retrieved_ids, relevant_ids),
            })

    # ─────────────────────────────────────────
    # Bảng kết quả từng query
    # ─────────────────────────────────────────
    print()
    print(f"Chi tiết theo từng query (Precision@{TOP_K} / Recall@{TOP_K} / RR):")
    print("-" * 80)
    header = f"{'Query':<6}" + "".join(f"{m.capitalize():>24}" for m in results)
    print(header)
    for i, q in enumerate(ground_truth["queries"]):
        row = f"{q['id']:<6}"
        for method in results:
            r = results[method][i]
            row += f"{r['precision']:.2f}/{r['recall']:.2f}/{r['rr']:.2f}".rjust(24)
        print(row)

    # ─────────────────────────────────────────
    # Bảng tổng hợp (trung bình toàn bộ query)
    # ─────────────────────────────────────────
    print()
    print(f"Tổng hợp trung bình trên {len(ground_truth['queries'])} query:")
    print("-" * 80)
    print(f"{'Phương pháp':<12}{'Precision@' + str(TOP_K):<16}{'Recall@' + str(TOP_K):<16}{'MRR':<10}")
    for method, rows in results.items():
        n = len(rows)
        avg_p = sum(r["precision"] for r in rows) / n
        avg_r = sum(r["recall"] for r in rows) / n
        avg_rr = sum(r["rr"] for r in rows) / n
        print(f"{method:<12}{avg_p:<16.3f}{avg_r:<16.3f}{avg_rr:<10.3f}")


if __name__ == "__main__":
    asyncio.run(evaluate())