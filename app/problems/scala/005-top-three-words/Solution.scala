def topThree(words: List[String]): List[String] =
  words
    .groupMapReduce(identity)(_ => 1)(_ + _)
    .toList
    .sortBy((w, c) => (-c, w))
    .take(3)
    .map((w, _) => w)
