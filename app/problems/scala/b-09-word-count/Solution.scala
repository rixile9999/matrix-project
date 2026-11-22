def wordCount(words: List[String]): Map[String, Int] =
  words.groupMapReduce(identity)(_ => 1)(_ + _)
