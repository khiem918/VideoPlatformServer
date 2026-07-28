# Architecture - VideoPlatform Server (Cloud Backend)

Hệ thống Backend Microservices cho kiến trúc nền tảng VideoPlatform - Được tối ưu hoá với mô hình triển khai tự động CI/CD Đám mây trên Amazon Web Services (AWS).

Hệ thống bao gồm hai dịch vụ chính chạy song song trong Docker:
- **`api_service`**: NestJS GraphQL API mạnh mẽ dành cho thao tác thông thường.
- **`search_service`**: Python FastAPI phục vụ tích hợp hệ thống Trí tuệ AI tìm kiếm nội dung nhúng (Semantic Search).

---

## Kiến trúc Đám mây & Công nghệ AWS Sử dụng

Dự án này là minh chứng trực quan cho bộ hệ sinh thái Serverless/Docker AWS thực tiễn, có khả năng mở rộng (scalable) và chịu tải cực lớn:

- **Amazon EC2 (Elastic Compute Cloud)**: Lưu trữ các cụm Machine Instances làm Production Server (IP/Host cố định) tích hợp hệ thống Volume mạnh của Docker.
- **AWS CodeBuild**: Dịch vụ CI/CD chịu trách nhiệm dịch mã, tạo các hình ảnh Docker và đẩy lên ECR trong vỏn vẹn $\sim 3$ phút/vòng mà không sử dụng Instance tài nguyên riêng.
- **Amazon ECR (Elastic Container Registry) Public**: Chứa tất cả Base Image cấu thành Runtime cho Docker giảm dung lượng tải xuống (Tránh vấn đề Rate Limit 429 từ Docker Hub).
- **Amazon S3**: Lưu kết cấu phân tách thư mục tĩnh `docker-compose.yml` phân luồng với Source Code gốc.
- **AWS SSM (Systems Manager)**: Kích hoạt triển khai liên lục qua Cờ `Send-Command` trỏ vào `$EC2_INSTANCE_ID`. Chuyển hoá lệnh CD an toàn tuyệt đối mà không cần Remote SSH/RSA Keys.
- **AWS Secrets Manager**: Nơi gộp tất cả môi trường, URL dữ liệu và Database Credentials, giúp ngăn chặn Leak lộ khoá trong Project Branch.

## Hệ thống Công nghệ Phần Mềm Cốt Lõi (Core Frameworks)

- **NestJS (11.x) \& GraphQL (Apollo)** - Engine Controller Backend.
- **Python (3.10) \& FastAPI** - Chạy Deep Learning Vector Embeddings model.
- **Docker \& Docker Compose** - Máy chủ lưu trữ ảo độc lập.
- **PostgreSQL 16 \& Prisma** - Giao cấu dữ liệu Relation Database.
- **RabbitMQ (Message Queue)** - Cơ chế xếp hàng bất đồng bộ phân phát lệnh.
- **Qdrant Vector Database** - Cơ sở dữ liệu AI.
- **Redis (KVT)** - Cache Management API.
- **Microservices gRPC** - Trục giao tiếp cực nhanh kết dính NestJS Node Server và FastAPI AI Model.

---

## CI/CD Hoạt Động Như Thế Nào (Cho Nhà Phát Triển)

Hệ thống đã được lập trình kịch bản Auto-CI/CD dựa trên Github Actions + AWS Native.
Ngay khi các nhà phát triển (Developers) `git push` đoạn mã sửa đổi lên Repository chứa thiết lập `.buildspec.yml`:

1. AWS **CodeBuild** sẽ tải về qua Git Webhook cấu trúc `node:20` & `python:3.10`.
2. Hệ thống biên soạn Image mới, giải phóng Dependency Rác, và `docker push` lên **Amazon ECR**.
3. **AWS Systems Manager (SSM)** truyền tín hiệu lệnh gọi kịch bản nội bộ (Zero-touch command).
4. Mã `/app/deploy.sh` tại máy chủ ảo **EC2** sẽ fetch các File Biến Môi Trường bằng \`aws secretsmanager\`.
5. Đóng Container cũ, Pull Image trên kho chứa ECR về chạy \`up -d\` với Container mới hoàn toàn mà không gián đoạn (Downtime nhỏ nhất).

---

## Cấu Trúc Mã Nguồn

```text
VideoPlatformServer/
├── api_service/          # NestJS Server: Xử lý Upload, Auth, Logic DB Postgres/Prisma
├── search_service/       # Python Server: Vector DB, Mô Hình ML/AI 
├── docker/               # Tệp tin mô tả cấu hình Compose liên kết hệ thống
├── script/               # Shell CI/CD AWS liên quan đến Deploy, S3.
├── buildspec-api.yml     # CodeBuild Configuration pipeline CI cho API
└── buildspec-search.yml  # CodeBuild Configuration pipeline CI cho Search
```

## Quy chuẩn Bảo Mật (Zero-Secret System)

1. Tệp tin `docker-entrypoint.sh` chặn mọi lệnh thực thi Migrate khi Database chưa đáp trả Port Healthcheck.
2. Mã nguồn **tuyệt đối không bao gồm `package-lock.json` hay `.env`, `.env.api`**. Chúng buộc phải lưu vào biến môi trường cục bộ hoặc phân tách độc quyền từ AWS Cloud (Secrets).
3. ECR Public Registry dùng Proxy tránh tình trạng CodeBuild IP chia sẻ Public dẫn tới 429 Too Many Request Limits.

---

*Hệ thống được lập trình \& đảm bảo vận hành ổn định trên tất cả các luồng Node/Python Backend Cloud!* 
