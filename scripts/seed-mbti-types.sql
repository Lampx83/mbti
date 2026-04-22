-- Seed minimal MBTI types (id + code).
-- You can run this once:
--   psql -d mbti_log -f scripts/seed-mbti-types.sql

INSERT INTO mbti_types (id, code) VALUES
  (1,  'INTJ'),
  (2,  'INTP'),
  (3,  'ENTJ'),
  (4,  'ENTP'),
  (5,  'INFJ'),
  (6,  'INFP'),
  (7,  'ENFJ'),
  (8,  'ENFP'),
  (9,  'ISTJ'),
  (10, 'ISFJ'),
  (11, 'ESTJ'),
  (12, 'ESFJ'),
  (13, 'ISTP'),
  (14, 'ISFP'),
  (15, 'ESTP'),
  (16, 'ESFP')
ON CONFLICT (code) DO NOTHING;

-- Keep the sequence aligned if you insert explicit ids
SELECT setval(pg_get_serial_sequence('mbti_types', 'id'), (SELECT COALESCE(MAX(id), 1) FROM mbti_types));

-- Verify seed result
SELECT COUNT(*) AS mbti_types_count FROM mbti_types;
SELECT id, code FROM mbti_types ORDER BY id;

