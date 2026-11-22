def groupAnagrams(words: List[String]): List[List[String]] =
  words.groupBy(_.sorted).toList.sortBy((key, _) => key).map((_, group) => group)
