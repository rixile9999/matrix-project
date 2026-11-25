@main def tests(): Unit =
  Judge.check("== 같은 좌표")(Point(1, 2) == Point(1, 2), true)
  Judge.check("== 다른 좌표")(Point(1, 2) == Point(2, 1), false)
  Judge.check("다른 타입과 비교")(Point(1, 2).equals("(1,2)"), false)
  val many = (1 to 10).map(i => Point(i, i)).toList
  Judge.check("Set 중복 제거")((many ++ (1 to 10).map(i => Point(i, i))).toSet.size, 10)
  Judge.check("Set contains")(many.toSet.contains(Point(7, 7)), true)
  Judge.check("Map 키 조회")(many.map(p => p -> p.x).toMap.get(Point(3, 3)), Some(3))
