@main def tests(): Unit =
  Judge.check("0")(sumTo(0), 0)
  Judge.check("1")(sumTo(1), 1)
  Judge.check("5")(sumTo(5), 15)
  Judge.check("10")(sumTo(10), 55)
  Judge.check("100")(sumTo(100), 5050)
