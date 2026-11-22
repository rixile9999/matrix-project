@main def tests(): Unit =
  Judge.check("빈 리스트")(averageOfPositives(Nil), None)
  Judge.check("음수만")(averageOfPositives(List(-1, -2)), None)
  Judge.check("0은 양수가 아님")(averageOfPositives(List(0, 0)), None)
  Judge.check("원소 하나")(averageOfPositives(List(7)), Some(7.0))
  Judge.check("소수점 평균")(averageOfPositives(List(1, 2)), Some(1.5))
  Judge.check("음수는 제외")(averageOfPositives(List(-5, 4, 0, 6)), Some(5.0))
  Judge.check("0이 평균에 끼면 안 됨")(averageOfPositives(List(0, 4, 6)), Some(5.0))
  Judge.check("나머지가 있는 나눗셈")(averageOfPositives(List(1, 1, 2)), Some(4.0 / 3))
