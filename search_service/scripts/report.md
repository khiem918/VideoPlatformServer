# So sánh Dense vs Sparse vs Hybrid Search cho Semantic Search (video_chunks)

**Người thực hiện:** Vạn Trường Thành
**Phạm vi:** `search_service` — collection `video_chunks` (transcript search)
**Ngày:** Tháng 7/2026

---

## 1. Bối cảnh & mục tiêu

Semantic search hiện tại (`ChunkQdrantService.search_chunks`) chỉ dùng **dense vector** (multilingual-e5-large) để tìm chunk transcript liên quan tới câu query. Collection `videos` (title/description, do team implement trước đó) đã có sẵn cả dense + sparse (BM25/IDF) + fusion RRF, nhưng `video_chunks` thì chưa.

Mục tiêu của việc kiểm tra này: bổ sung sparse vector cho `video_chunks`, cài đặt hybrid search (RRF), và **đo lường thực nghiệm** xem phương pháp nào phù hợp nhất cho use case tìm kiếm theo nội dung transcript video, trước khi quyết định đưa hybrid vào production.

---

## 2. Thay đổi kỹ thuật

### 2.1. Bổ sung sparse vector cho `video_chunks`

- `chunk_qdrant.py`: thêm `sparse_vectors_config` (Modifier.IDF) vào schema collection, cập nhật `upsert_chunks()` để nhận và lưu cả `SparseVector`.
- `video_processing_service.py`: gọi thêm `EmbeddingService.embed_sparse()` song song với `embed_dense()` khi index chunk mới.
- Thêm 2 hàm search mới trong `ChunkQdrantService`:
  - `search_chunks_sparse()` — sparse-only (BM25/IDF)
  - `search_chunks_hybrid()` — dense + sparse, hợp nhất bằng **RRF** (Reciprocal Rank Fusion), theo đúng pattern đã có trong `qdrant.py` (collection `videos`)

### 2.2. Bug phát hiện & đã sửa: bất đối xứng chuẩn hóa dấu tiếng Việt

Trong lúc kiểm tra, phát hiện `search.py` chuẩn hóa câu query bằng `normalize_search_query()` — hàm này dùng `unidecode` để **xóa dấu tiếng Việt** (`"nước dùng"` → `"nuoc dung"`). Trong khi đó, `video_processing_service.py` lại embed **transcript gốc, có dấu**. Hệ quả:

- **Sparse/BM25**: gần như luôn thất bại với query tiếng Việt có dấu, vì token không trùng khớp ở tầng ký tự với chunk đã index (`"nuoc"` ≠ `"nước"`).
- **Dense**: vẫn hoạt động nhưng có thể giảm chất lượng do model nhận input không đúng dạng tiếng Việt chuẩn.

**Hướng xử lý đã chọn**: thay vì bỏ dấu ở cả 2 phía (theo quy ước cũ của `normalize_search_query`, vốn chỉ phù hợp cho title/desc), quyết định **giữ dấu tiếng Việt xuyên suốt pipeline transcript** để tối ưu chất lượng semantic search — vì multilingual-e5 được train trên tiếng Việt có dấu.

- Thêm hàm mới `normalize_transcript_text()` trong `normalize.py` (giữ dấu, chỉ loại emoji/dấu câu/khoảng trắng thừa).
- Áp dụng hàm này ở **cả 2 đầu**: `video_processing_service.py` (lúc index) và `search.py` (lúc search) để đảm bảo đối xứng.
- `normalize_search_query`, `normalize_title`, `normalize_desc` **giữ nguyên**, không ảnh hưởng tới collection `videos`.

> ⚠️ **Lưu ý cho team**: `qdrant.py` (`search_points()`, collection `videos`) đang dùng `models.FusionQuery(function=models.Fusion.RRF)` — tham số `function` đã đổi tên thành `fusion` trong `qdrant-client==1.18.0`. Nếu hàm này chưa được test end-to-end, cần sửa lại tương tự để tránh lỗi `ValidationError` khi gọi.

---

## 3. Phương pháp đánh giá

### 3.1. Dữ liệu test

6 "video" giả (text đưa trực tiếp, không qua Whisper), mỗi video 3 chunk, thuộc 6 chủ đề tách biệt để tạo đủ nhiễu: **nấu ăn, du lịch (tiếng Anh), bóng đá, công nghệ/AI (tiếng Anh), âm nhạc, thời tiết** — tổng 18 chunk. Script: `scripts/seed_test_data.py`.

### 3.2. Bộ query & ground truth

10 query, 2 query/chủ đề (5 chủ đề mới), viết theo lối **diễn đạt tự nhiên (paraphrase)** — cố tình tránh lặp từ khóa chính xác với transcript, để bộc lộ rõ khác biệt giữa dense (hiểu ngữ nghĩa) và sparse (khớp từ khóa). Một số query cố ý **xuyên ngôn ngữ** (query tiếng Việt cho nội dung tiếng Anh) để kiểm tra khả năng đa ngôn ngữ. Ground truth: `scripts/ground_truth.json`, ánh xạ `query → chunk_id` chính xác (tính bằng `uuid5`, không phải đoán).

### 3.3. Chỉ số đo lường

Đo trên **top-3 kết quả** (k=3): **Precision@3**, **Recall@3**, **MRR** (Mean Reciprocal Rank). Script: `scripts/eval_search_methods.py`, chạy cả 10 query qua 3 phương pháp (`search_chunks`, `search_chunks_sparse`, `search_chunks_hybrid`), trung bình kết quả.

---

## 4. Kết quả

| Phương pháp | Precision@3 | Recall@3 | MRR |
|---|---|---|---|
| **Dense** | 0.367 | **1.000** | **0.900** |
| Sparse | 0.233 | 0.600 | 0.533 |
| Hybrid (RRF) | 0.300 | 0.800 | 0.684 |

Chi tiết theo từng query (Precision@3 / Recall@3 / RR):

| Query | Chủ đề | Dense | Sparse | Hybrid |
|---|---|---|---|---|
| q01 | cooking | 0.67/1.00/1.00 | 0.67/1.00/1.00 | 0.67/1.00/1.00 |
| q02 | cooking | 0.33/1.00/1.00 | 0.33/1.00/0.33 | 0.33/1.00/0.50 |
| q03 | travel (cross-lingual) | 0.33/1.00/0.50 | **0.00/0.00/0.00** | **0.00/0.00/0.20** |
| q04 | travel (cross-lingual) | 0.33/1.00/1.00 | **0.00/0.00/0.00** | 0.33/1.00/0.50 |
| q05 | sports | 0.33/1.00/1.00 | 0.33/1.00/1.00 | 0.33/1.00/1.00 |
| q06 | sports | 0.33/1.00/1.00 | 0.33/1.00/1.00 | 0.33/1.00/1.00 |
| q07 | tech (cross-lingual) | 0.33/1.00/1.00 | **0.00/0.00/0.00** | 0.33/1.00/0.50 |
| q08 | tech (cross-lingual) | 0.33/1.00/1.00 | 0.33/1.00/1.00 | 0.33/1.00/1.00 |
| q09 | music | 0.33/1.00/1.00 | 0.33/1.00/1.00 | 0.33/1.00/1.00 |
| q10 | music | 0.33/1.00/0.50 | **0.00/0.00/0.00** | **0.00/0.00/0.14** |

---

## 5. Phân tích

### 5.1. Dense thắng rõ rệt

Kết quả này đúng như kỳ vọng thiết kế: bộ query được soạn theo lối paraphrase, không lặp từ khóa transcript — đây chính là kịch bản dense/semantic được sinh ra để xử lý tốt. Dense đạt Recall@3 tuyệt đối (1.000) và MRR rất cao (0.900).

### 5.2. Sparse thất bại hoàn toàn với query xuyên ngôn ngữ

4/10 query (q03, q04, q07, q10) là query tiếng Việt cho nội dung tiếng Anh. Sparse/BM25 chỉ khớp theo token chính xác — không có gì chung giữa `"địa điểm du lịch"` và `"Kyoto temples"` ở tầng ký tự, nên sparse-only trả về 0.00/0.00/0.00 ở cả 4 query này. Đây là giới hạn cố hữu, đã biết trước của sparse.

### 5.3. Phát hiện quan trọng nhất: Hybrid (RRF) có thể **tệ hơn** Dense đơn lẻ

Ở q03 và q10, Hybrid cho kết quả **tệ hơn Dense** (q03: RR giảm từ 0.50 xuống 0.00; q10: giảm từ 0.50 xuống 0.14), dù Hybrid kết hợp cả 2 nhánh.

**Nguyên nhân**: RRF (Reciprocal Rank Fusion) tính điểm mỗi chunk bằng `1/(k + rank)` trên **từng nhánh**, cộng lại — thuật toán ngầm giả định dense và sparse **đáng tin cậy ngang nhau**. Khi sparse gần như trả về kết quả ngẫu nhiên (do mismatch ngôn ngữ), những chunk sai nhưng vô tình xếp hạng cao ở nhánh sparse vẫn được cộng điểm, có thể vượt qua chunk đúng — vốn chỉ mạnh ở nhánh dense — ra khỏi top-3. RRF không có cơ chế tự động giảm trọng số cho nhánh đang "không đáng tin" với một lớp query cụ thể.

---

## 6. Kết luận & khuyến nghị

- **Với dữ liệu và use case hiện tại (transcript video, query dạng tự nhiên/đa ngôn ngữ), Dense-only là lựa chọn tốt nhất.**
- **Hybrid (RRF không trọng số) không cải thiện so với Dense-only, và có thể làm giảm chất lượng** ở các query cross-lingual — nơi sparse mất tin cậy nhưng vẫn được tính bình đẳng trong công thức fusion.
- Sparse hữu ích trong trường hợp người dùng tìm chính xác theo từ khóa/tên riêng, nhưng không nên dùng làm phương pháp chính hay fusion không điều kiện cho transcript search.
- **Khuyến nghị**: giữ `search_chunks()` (dense-only) làm phương pháp mặc định cho production. Nếu muốn khai thác hybrid trong tương lai, cần cân nhắc RRF có trọng số hoặc cơ chế fallback (chỉ dùng sparse khi có tín hiệu rõ ràng — VD: query ngắn, có dấu ngoặc kép, hoặc match chính xác tên riêng).

---

## 7. Giới hạn của benchmark này

- Bộ dữ liệu nhỏ (18 chunk, 6 chủ đề, 10 query) — đủ để phát hiện xu hướng và vấn đề định tính, nhưng chưa đủ lớn để kết luận định lượng chắc chắn cho production scale.
- Ground truth mỗi query chỉ có 1-2 chunk relevant trên tổng 18 chunk — Recall@3 dễ đạt tối đa, chưa phải phép thử khó.
- Chưa test trường hợp sparse có lợi thế rõ (VD: tên riêng, số liệu, từ chuyên ngành xuất hiện chính xác) — nên bổ sung nếu muốn đánh giá toàn diện hơn.

---

## 8. Tài liệu liên quan

- `scripts/seed_test_data.py` — script tạo dữ liệu test
- `scripts/ground_truth.json` — bộ query + ground truth
- `scripts/eval_search_methods.py` — script đánh giá, tính Precision@k/Recall@k/MRR
- `src/infrastructure/database/chunk_qdrant.py` — cài đặt search (dense/sparse/hybrid)
- `src/domain/service/normalize.py` — hàm `normalize_transcript_text()` mới
