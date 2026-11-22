@main def tests(): Unit =
  Judge.check("짧으면 그대로")("hello".truncate(10), "hello")
  Judge.check("길이가 정확히 n")("hello".truncate(5), "hello")
  Judge.check("넘으면 줄임")("hello world".truncate(5), "hell…")
  Judge.check("빈 문자열")("".truncate(3), "")
  Judge.check("n이 1")("ab".truncate(1), "…")
  Judge.check("결과 길이는 n")("abcdefghij".truncate(4).length, 4)
