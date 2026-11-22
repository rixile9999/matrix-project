@main def tests(): Unit =
  Judge.check("빈 리스트")(firstOverdraft(Nil), -1)
  Judge.check("한 번도 안 내려감")(firstOverdraft(List(5, -3)), -1)
  Judge.check("첫 거래에서")(firstOverdraft(List(-1)), 1)
  Judge.check("세 번째")(firstOverdraft(List(5, -3, -3, 10)), 3)
  Judge.check("나중에 회복되어도 처음 시점")(firstOverdraft(List(1, -2, 5)), 2)
  Judge.check("정확히 0은 통과")(firstOverdraft(List(3, -3, 0)), -1)
  Judge.check("0 다음에 내려감")(firstOverdraft(List(3, -3, -1)), 3)
  Judge.check("마지막 거래에서")(firstOverdraft(List(4, 4, -9)), 3)
