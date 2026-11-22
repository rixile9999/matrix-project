@main def tests(): Unit =
  Judge.check("빈 벡터")(lowerBound(Vector.empty, 5), 0)
  Judge.check("하나, 같음")(lowerBound(Vector(5), 5), 0)
  Judge.check("중복 중 첫 위치")(lowerBound(Vector(1, 2, 2, 2, 3), 2), 1)
  Judge.check("중복이 전부 같은 값")(lowerBound(Vector(4, 4, 4, 4), 4), 0)
  Judge.check("없는 값은 다음 원소 위치")(lowerBound(Vector(1, 3, 5, 7), 4), 2)
  Judge.check("모두보다 큼")(lowerBound(Vector(1, 3, 5, 7), 8), 4)
  Judge.check("마지막 원소와 같음")(lowerBound(Vector(1, 3, 5, 7), 7), 3)
  Judge.check("큰 입력")(lowerBound(Vector.range(0, 100000).map(_ * 2), 99999), 50000)
