@main def tests(): Unit =
  Judge.check("빈 리스트")(topThree(Nil), Nil)
  Judge.check("단어 하나")(topThree(List("a")), List("a"))
  Judge.check("3개보다 적음")(topThree(List("b", "a", "b")), List("b", "a"))
  Judge.check("횟수 순서")(topThree(List("x", "y", "y", "z", "z", "z", "w", "w", "w", "w")), List("w", "z", "y"))
  Judge.check("동률은 사전순")(topThree(List("pear", "apple", "pear", "fig", "apple", "kiwi", "fig", "kiwi")), List("apple", "fig", "kiwi"))
  Judge.check("동률과 횟수 혼합")(topThree(List("b", "a", "c", "c", "d", "d", "e")), List("c", "d", "a"))
  Judge.check("4개 이상에서 자르기")(topThree(List("d", "c", "b", "a")), List("a", "b", "c"))
  Judge.check("대문자는 소문자보다 앞")(topThree(List("b", "B", "b", "B", "a")), List("B", "b", "a"))
