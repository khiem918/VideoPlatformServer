import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:5434/video_streaming?schema=test"
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DB_URL })
});

const testData = [
  {
    "id": 1,
    "title": "Lofi Chill Beats for Deep Study",
    "description": "A relaxing collection of lofi beats designed for studying, reading, coding, and staying focused for long sessions."
  },
  {
    "id": 2,
    "title": "Morning Jazz Cafe Ambience",
    "description": "Smooth jazz background music with cozy coffee shop ambience for mornings, work, and relaxing moments."
  },
  {
    "id": 3,
    "title": "How to Build a NestJS REST API",
    "description": "Step by step tutorial on creating a scalable REST API using NestJS, Prisma, PostgreSQL, and clean architecture."
  },
  {
    "id": 4,
    "title": "FastAPI Beginner Crash Course",
    "description": "Learn FastAPI fundamentals including routing, request validation, async handlers, and deployment basics."
  },
  {
    "id": 5,
    "title": "Top 10 VSCode Extensions for Developers",
    "description": "Useful VSCode extensions to improve coding productivity, debugging workflow, and development speed."
  },
  {
    "id": 6,
    "title": "Night Rain Sounds for Sleep",
    "description": "Gentle rain and thunder ambience to help with sleep, relaxation, meditation, and stress relief."
  },
  {
    "id": 7,
    "title": "Gaming Montage FPS Highlights",
    "description": "Fast paced first person shooter montage featuring clutches, headshots, and epic plays."
  },
  {
    "id": 8,
    "title": "Learn Python in 30 Minutes",
    "description": "Quick beginner guide covering variables, loops, functions, lists, and simple Python examples."
  },
  {
    "id": 9,
    "title": "Deep Focus Music for Coding",
    "description": "Non distracting instrumental background music for programmers who need concentration."
  },
  {
    "id": 10,
    "title": "Street Food Tour in Tokyo",
    "description": "Explore amazing Japanese street food including ramen, takoyaki, sushi, and hidden local spots."
  },
  {
    "id": 11,
    "title": "How Qdrant Vector Search Works",
    "description": "Understand embeddings, similarity search, payload filters, and semantic retrieval using Qdrant."
  },
  {
    "id": 12,
    "title": "Relaxing Piano Music for Reading",
    "description": "Soft piano melodies perfect for reading books, journaling, and calm evenings."
  },
  {
    "id": 13,
    "title": "Build a Discord Bot with Node.js",
    "description": "Create a Discord bot using Node.js, slash commands, events, and deployment tips."
  },
  {
    "id": 14,
    "title": "Top Anime Openings of All Time",
    "description": "A ranking of iconic anime opening songs loved by fans around the world."
  },
  {
    "id": 15,
    "title": "Minimal Desk Setup Tour",
    "description": "A clean minimalist workspace setup for productivity, remote work, and studying."
  },
  {
    "id": 16,
    "title": "Learn SQL Basics Fast",
    "description": "Understand SELECT, INSERT, UPDATE, DELETE, JOIN, and database fundamentals quickly."
  },
  {
    "id": 17,
    "title": "Epic Cinematic Trailer Music Mix",
    "description": "Powerful cinematic orchestral music for motivation, trailers, and workouts."
  },
  {
    "id": 18,
    "title": "How to Edit Videos in Premiere Pro",
    "description": "Beginner editing workflow using Adobe Premiere Pro including cuts, transitions, and export."
  },
  {
    "id": 19,
    "title": "Calm Ocean Waves at Sunset",
    "description": "Peaceful ocean ambience with waves and sunset visuals for relaxation."
  },
  {
    "id": 20,
    "title": "JavaScript Async Await Explained",
    "description": "Simple explanation of promises, async functions, await syntax, and common mistakes."
  },
  {
    "id": 21,
    "title": "Top 25 Productivity Apps",
    "description": "Best apps for task management, notes, calendars, focus, and time tracking."
  },
  {
    "id": 22,
    "title": "Lofi Hip Hop Radio Mix",
    "description": "Continuous chill hip hop beats for studying, relaxing, and working."
  },
  {
    "id": 23,
    "title": "Beginner Guitar Lesson One",
    "description": "Learn chords, rhythm, finger placement, and simple songs for new guitar players."
  },
  {
    "id": 24,
    "title": "How Recommendation Systems Work",
    "description": "An overview of collaborative filtering, embeddings, ranking models, and personalization."
  },
  {
    "id": 25,
    "title": "Meditation Music for Stress Relief",
    "description": "Slow calming sounds designed for breathing exercises and stress reduction."
  },
  {
    "id": 26,
    "title": "Build Search Engine with Elasticsearch",
    "description": "Learn indexing, analyzers, queries, scoring, and scalable search architecture."
  },
  {
    "id": 27,
    "title": "Late Night Coding Session Ambience",
    "description": "Keyboard sounds, rain, and soft music for immersive late night programming vibes."
  },
  {
    "id": 28,
    "title": "How to Learn Faster with Active Recall",
    "description": "Study techniques using active recall, spaced repetition, and note systems."
  },
  {
    "id": 29,
    "title": "Travel Guide to Seoul Korea",
    "description": "Places to visit, food recommendations, transport tips, and local experiences in Seoul."
  },
  {
    "id": 30,
    "title": "Docker for Beginners Full Guide",
    "description": "Learn containers, images, Dockerfile, compose, and deployment basics."
  },
  {
    "id": 31,
    "title": "Top EDM Festival Tracks",
    "description": "Energetic electronic dance music festival anthems and crowd favorites."
  },
  {
    "id": 32,
    "title": "Home Workout No Equipment",
    "description": "Bodyweight exercises for fitness at home without any equipment."
  },
  {
    "id": 33,
    "title": "Understanding Redis Caching",
    "description": "Learn Redis caching strategies, sessions, queues, pubsub, and performance gains."
  },
  {
    "id": 34,
    "title": "Rainy Cafe Jazz Playlist",
    "description": "Warm jazz tunes with rain ambience for relaxing afternoons."
  },
  {
    "id": 35,
    "title": "React Beginner Project Tutorial",
    "description": "Build a beginner React project using components, hooks, props, and state."
  },
  {
    "id": 36,
    "title": "Dark Trap Beat Instrumental",
    "description": "Heavy bass trap instrumental for freestyle, edits, and gaming videos."
  },
  {
    "id": 37,
    "title": "Top 10 Linux Commands",
    "description": "Essential terminal commands every Linux user should know."
  },
  {
    "id": 38,
    "title": "Cloud Storage Explained",
    "description": "Understand object storage, CDN delivery, buckets, and scalability."
  },
  {
    "id": 39,
    "title": "Nature Forest Sounds Relaxation",
    "description": "Birds, wind, and forest ambience for calmness and focus."
  },
  {
    "id": 40,
    "title": "Prisma ORM Full Tutorial",
    "description": "Learn schema design, migrations, relations, and database access using Prisma."
  },
  {
    "id": 41,
    "title": "How AI Embeddings Work",
    "description": "Understand vector representations of text and how semantic search is possible."
  },
  {
    "id": 42,
    "title": "Chill RnB Playlist 2026",
    "description": "Smooth modern RnB songs for night drives and relaxing moods."
  },
  {
    "id": 43,
    "title": "Build a Video Streaming Backend",
    "description": "Architecture guide for video upload, transcoding, CDN, search, and recommendation."
  },
  {
    "id": 44,
    "title": "Top Horror Games to Play",
    "description": "Scary games with immersive gameplay, atmosphere, and jump scares."
  },
  {
    "id": 45,
    "title": "How CPUs Actually Work",
    "description": "Simple explanation of processors, cores, threads, cache, and execution."
  },
  {
    "id": 46,
    "title": "Peaceful Snow Cabin Ambience",
    "description": "Fireplace sounds and snowy cabin atmosphere for sleep and comfort."
  },
  {
    "id": 47,
    "title": "Best Keyboard for Programmers",
    "description": "Mechanical keyboard recommendations for coders and office productivity."
  },
  {
    "id": 48,
    "title": "Machine Learning Basics Explained",
    "description": "Intro to supervised learning, datasets, training, and prediction models."
  },
  {
    "id": 49,
    "title": "Top Mobile Games This Year",
    "description": "Popular mobile games with great gameplay and active communities."
  },
  {
    "id": 50,
    "title": "Study With Me Pomodoro Session",
    "description": "50 minute focused study timer with ambient music and break reminders."
  }
];

async function main() {
  console.log('Seeding VideoTest database...');

  await prisma.videoTest.deleteMany({}); 

  for (const item of testData) {
    await prisma.videoTest.create({
      data: {
        id: item.id.toString(), 
        name: item.title,
        desc: item.description
      }
    });
  }

  console.log(`Successfully seeded ${testData.length} VideoTest records!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
