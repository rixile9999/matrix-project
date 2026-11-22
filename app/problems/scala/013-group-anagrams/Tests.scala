@main def tests(): Unit =
  Judge.check("빈 리스트")(groupAnagrams(Nil), Nil)
  Judge.check("단어 하나")(groupAnagrams(List("a")), List(List("a")))
  Judge.check("애너그램 없음")(groupAnagrams(List("b", "a", "c")), List(List("a"), List("b"), List("c")))
  Judge.check("기본 예")(groupAnagrams(List("tea", "tan", "eat")), List(List("tea", "eat"), List("tan")))
  Judge.check("여러 묶음")(
    groupAnagrams(List("eat", "tea", "tan", "ate", "nat", "bat")),
    List(List("bat"), List("eat", "tea", "ate"), List("tan", "nat"))
  )
  Judge.check("같은 단어 반복")(groupAnagrams(List("ab", "ba", "ab")), List(List("ab", "ba", "ab")))
  Judge.check("빈 문자열")(groupAnagrams(List("x", "", "")), List(List("", ""), List("x")))
  Judge.check("키 사전순")(groupAnagrams(List("zz", "ab", "ba", "za")), List(List("ab", "ba"), List("za"), List("zz")))
