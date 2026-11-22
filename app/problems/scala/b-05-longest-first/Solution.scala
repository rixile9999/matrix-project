def longestFirst(words: List[String]): List[String] =
  words.sortBy(w => -w.length)
